package app.runtrovert.heart

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * Heart rate from any Bluetooth LE strap or watch that broadcasts the standard
 * Heart Rate service (0x180D): Garmin's "Broadcast heart rate", Polar, Coros,
 * Wahoo, most chest straps. The phone talks to the sensor directly; nothing
 * goes over the network. Readings go to JS as they arrive; src/strap.ts
 * stores them with the run, like the Wear OS app's.
 *
 * One sensor at a time. While JS wants it connected, a dropped link is retried
 * in the background (autoConnect), so walking out of range and back is fine.
 */
@SuppressLint("MissingPermission") // JS asks for BLUETOOTH_SCAN / _CONNECT first; every call is guarded.
class RuntrovertHeartModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private val adapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private val main = Handler(Looper.getMainLooper())
  private var scanning: ScanCallback? = null
  private var gatt: BluetoothGatt? = null
  private var wanted: String? = null

  override fun definition() = ModuleDefinition {
    Name("RuntrovertHeart")

    Events("onFound", "onHeart", "onState")

    Function("isSupported") { adapter != null && context.packageManager.hasSystemFeature("android.hardware.bluetooth_le") }

    Function("isOn") { runCatching { adapter?.isEnabled == true }.getOrDefault(false) }

    // Looks for heart-rate sensors for `ms`, each one reported once per sighting.
    Function("startScan") { ms: Int ->
      stopScan()
      val scanner = runCatching { adapter?.bluetoothLeScanner }.getOrNull() ?: return@Function false
      val cb = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
          val d = result.device ?: return
          val name = runCatching { d.name }.getOrNull() ?: result.scanRecord?.deviceName ?: ""
          sendEvent("onFound", mapOf("id" to d.address, "name" to name, "rssi" to result.rssi))
        }
      }
      val filter = ScanFilter.Builder().setServiceUuid(ParcelUuid(HR_SERVICE)).build()
      val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
      val ok = runCatching { scanner.startScan(listOf(filter), settings, cb) }.isSuccess
      if (ok) {
        scanning = cb
        main.postDelayed({ if (scanning === cb) stopScan() }, ms.toLong().coerceIn(1_000, 30_000))
      }
      ok
    }

    Function("stopScan") { stopScan() }

    // Connect to the sensor and keep at it until disconnect().
    Function("connect") { id: String ->
      if (wanted == id && gatt != null) return@Function true
      close()
      wanted = id
      open(id, false)
    }

    Function("disconnect") {
      wanted = null
      close()
      state("off")
    }

    OnDestroy {
      stopScan()
      wanted = null
      close()
    }
  }

  private fun stopScan() {
    val cb = scanning ?: return
    scanning = null
    runCatching { adapter?.bluetoothLeScanner?.stopScan(cb) }
  }

  private fun open(id: String, auto: Boolean): Boolean {
    val device: BluetoothDevice = runCatching { adapter?.getRemoteDevice(id) }.getOrNull() ?: return false
    state("connecting")
    gatt = runCatching { device.connectGatt(context, auto, callback, BluetoothDevice.TRANSPORT_LE) }.getOrNull()
    return gatt != null
  }

  private fun close() {
    val g = gatt ?: return
    gatt = null
    runCatching { g.disconnect() }
    runCatching { g.close() }
  }

  private fun state(s: String) = sendEvent("onState", mapOf("state" to s))

  private val callback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
      if (g !== gatt) return
      if (newState == BluetoothProfile.STATE_CONNECTED) {
        state("connected")
        runCatching { g.discoverServices() }
      } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
        val id = wanted
        main.post {
          if (g !== gatt) return@post
          close()
          // Still wanted: let Android reconnect when the sensor is back in range.
          if (id != null && wanted == id) open(id, true) else state("off")
        }
      }
    }

    override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
      val ch = g.getService(HR_SERVICE)?.getCharacteristic(HR_MEASUREMENT) ?: return state("noHeart")
      runCatching { g.setCharacteristicNotification(ch, true) }
      val cccd = ch.getDescriptor(CCCD) ?: return
      runCatching {
        if (Build.VERSION.SDK_INT >= 33) {
          g.writeDescriptor(cccd, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
        } else {
          @Suppress("DEPRECATION")
          cccd.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
          @Suppress("DEPRECATION")
          g.writeDescriptor(cccd)
        }
      }
    }

    // Android 13+.
    override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic, value: ByteArray) {
      reading(ch, value)
    }

    // Android 12 and older.
    @Deprecated("Android 12 and older")
    override fun onCharacteristicChanged(g: BluetoothGatt, ch: BluetoothGattCharacteristic) {
      @Suppress("DEPRECATION")
      if (Build.VERSION.SDK_INT < 33) reading(ch, ch.value ?: return)
    }
  }

  private fun reading(ch: BluetoothGattCharacteristic, v: ByteArray) {
    if (ch.uuid != HR_MEASUREMENT) return
    val bpm = parseBpm(v) ?: return
    sendEvent("onHeart", mapOf("bpm" to bpm, "ts" to System.currentTimeMillis().toDouble()))
  }

  companion object {
    private fun uuid16(short: Int) = UUID.fromString(String.format("%08x-0000-1000-8000-00805f9b34fb", short))
    val HR_SERVICE: UUID = uuid16(0x180D)
    val HR_MEASUREMENT: UUID = uuid16(0x2A37)
    val CCCD: UUID = uuid16(0x2902)

    /**
     * Heart Rate Measurement: flags, then the value as uint8 or uint16 (flag bit 0).
     * Bits 1-2 say whether the sensor touches skin; "supported but no contact"
     * means the strap is off or dry, so the reading is dropped. 0 is never a beat.
     */
    fun parseBpm(v: ByteArray): Int? {
      if (v.size < 2) return null
      val flags = v[0].toInt() and 0xFF
      val contact = (flags shr 1) and 0b11
      if (contact == 0b10) return null
      val bpm = if (flags and 1 == 0) v[1].toInt() and 0xFF else if (v.size >= 3) (v[1].toInt() and 0xFF) or ((v[2].toInt() and 0xFF) shl 8) else return null
      return bpm.takeIf { it in 25..250 }
    }
  }
}
