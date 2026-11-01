import android.app.UiAutomation;
import android.graphics.Rect;
import android.os.SystemClock;
import android.util.Xml;
import android.view.accessibility.AccessibilityNodeInfo;

import java.io.File;
import java.io.IOException;
import java.io.Writer;
import java.lang.reflect.InvocationTargetException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import org.xmlpull.v1.XmlSerializer;

/**
 * Test-only hierarchy capture for a continuously updating UI.
 * Runs as adb shell via app_process with the device's uiautomator.jar.
 * Deliberately does not call waitForIdle. Does not change application state.
 * Compile against the public Android SDK: hidden wrapper access is reflective.
 */
public final class RtUiDump {
    private static final long ROOT_TIMEOUT_MS = 5000;
    private static final int MAX_NODES = 10000;
    private static final int MAX_DEPTH = 150;

    private static final class Counts {
        int nodes;
        int nullChildren;
    }

    public static void main(String[] args) {
        int code = 0;
        try {
            run(args);
        } catch (Throwable error) {
            code = 1;
            Throwable cause = error instanceof InvocationTargetException
                    && error.getCause() != null ? error.getCause() : error;
            System.err.println("RT_UI_DUMP_ERROR: " + cause);
            cause.printStackTrace(System.err);
        }
        System.exit(code);
    }

    private static void run(String[] args) throws Exception {
        if (args.length < 3 || args.length > 4) {
            throw new IllegalArgumentException(
                    "Usage: RtUiDump OUTPUT_XML WIDTH HEIGHT [ROTATION_0_TO_3]");
        }
        File output = new File(args[0]).getAbsoluteFile();
        int width = Integer.parseInt(args[1]);
        int height = Integer.parseInt(args[2]);
        int rotation = args.length == 4 ? Integer.parseInt(args[3]) : 0;
        if (width <= 0 || height <= 0 || rotation < 0 || rotation > 3) {
            throw new IllegalArgumentException("Invalid display dimensions or rotation");
        }
        File directory = output.getParentFile();
        if (!directory.isDirectory()) {
            throw new IOException("Output directory does not exist: " + directory);
        }
        // A failed new capture must never leave a previous capture looking fresh.
        Files.deleteIfExists(output.toPath());
        File temporary = new File(directory,
                output.getName() + ".tmp." + android.os.Process.myPid());
        Files.deleteIfExists(temporary.toPath());

        Class<?> wrapperClass = Class.forName(
                "com.android.uiautomator.core.UiAutomationShellWrapper");
        Object wrapper = wrapperClass.getConstructor().newInstance();
        boolean connected = false;
        AccessibilityNodeInfo root = null;
        try {
            wrapperClass.getMethod("connect").invoke(wrapper);
            connected = true;
            wrapperClass.getMethod("setCompressedLayoutHierarchy", boolean.class)
                    .invoke(wrapper, false);
            UiAutomation automation = (UiAutomation) wrapperClass
                    .getMethod("getUiAutomation").invoke(wrapper);

            // The bridge may initially return null after connecting. Retry null
            // roots for a bounded time without requiring a quiet event stream.
            long deadline = SystemClock.uptimeMillis() + ROOT_TIMEOUT_MS;
            do {
                root = automation.getRootInActiveWindow();
                if (root != null) break;
                SystemClock.sleep(100);
            } while (SystemClock.uptimeMillis() < deadline);
            if (root == null) throw new IOException("No active-window root within 5 seconds");

            Counts counts = new Counts();
            try (Writer writer = Files.newBufferedWriter(
                    temporary.toPath(), StandardCharsets.UTF_8)) {
                XmlSerializer xml = Xml.newSerializer();
                xml.setOutput(writer);
                xml.startDocument("UTF-8", true);
                xml.startTag("", "hierarchy");
                xml.attribute("", "rotation", Integer.toString(rotation));
                writeNode(root, xml, 0, 0, new Rect(0, 0, width, height), counts);
                xml.endTag("", "hierarchy");
                xml.endDocument();
                xml.flush();
            }
            if (!temporary.isFile() || temporary.length() == 0 || counts.nodes == 0) {
                throw new IOException("Capture produced no hierarchy");
            }
            Files.move(temporary.toPath(), output.toPath(),
                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            System.out.println("RT_UI_DUMP_OK: " + output + " nodes=" + counts.nodes
                    + " skipped_null_children=" + counts.nullChildren);
        } finally {
            if (root != null) root.recycle();
            try {
                if (connected) wrapperClass.getMethod("disconnect").invoke(wrapper);
            } finally {
                Files.deleteIfExists(temporary.toPath());
            }
        }
    }

    private static void writeNode(AccessibilityNodeInfo node, XmlSerializer xml,
            int index, int depth, Rect display, Counts counts) throws IOException {
        if (depth > MAX_DEPTH || ++counts.nodes > MAX_NODES) {
            throw new IOException("Hierarchy exceeded traversal limits");
        }
        xml.startTag("", "node");
        attr(xml, "index", Integer.toString(index));
        attr(xml, "text", node.getText());
        attr(xml, "resource-id", node.getViewIdResourceName());
        attr(xml, "class", node.getClassName());
        attr(xml, "package", node.getPackageName());
        attr(xml, "content-desc", node.getContentDescription());
        attr(xml, "checkable", Boolean.toString(node.isCheckable()));
        attr(xml, "checked", Boolean.toString(node.isChecked()));
        attr(xml, "clickable", Boolean.toString(node.isClickable()));
        attr(xml, "enabled", Boolean.toString(node.isEnabled()));
        attr(xml, "focusable", Boolean.toString(node.isFocusable()));
        attr(xml, "focused", Boolean.toString(node.isFocused()));
        attr(xml, "scrollable", Boolean.toString(node.isScrollable()));
        attr(xml, "long-clickable", Boolean.toString(node.isLongClickable()));
        attr(xml, "password", Boolean.toString(node.isPassword()));
        attr(xml, "selected", Boolean.toString(node.isSelected()));
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        if (!bounds.intersect(display)) bounds.setEmpty();
        attr(xml, "bounds", "[" + bounds.left + "," + bounds.top + "]["
                + bounds.right + "," + bounds.bottom + "]");
        int children = node.getChildCount();
        for (int i = 0; i < children; i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child == null) {
                counts.nullChildren++;
                continue;
            }
            try {
                // Match stock dump visibility filtering, but never wait for idle.
                if (child.isVisibleToUser()) {
                    writeNode(child, xml, i, depth + 1, display, counts);
                }
            } finally {
                child.recycle();
            }
        }
        xml.endTag("", "node");
    }

    private static void attr(XmlSerializer xml, String key, CharSequence value)
            throws IOException {
        String input = value == null ? "" : value.toString();
        StringBuilder clean = new StringBuilder(input.length());
        for (int offset = 0; offset < input.length();) {
            int cp = input.codePointAt(offset);
            offset += Character.charCount(cp);
            if (cp == 0x9 || cp == 0xA || cp == 0xD
                    || (cp >= 0x20 && cp <= 0xD7FF)
                    || (cp >= 0xE000 && cp <= 0xFFFD)
                    || (cp >= 0x10000 && cp <= 0x10FFFF)) {
                clean.appendCodePoint(cp);
            }
        }
        xml.attribute("", key, clean.toString());
    }
}
