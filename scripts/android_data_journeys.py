"""Backup and import checks using disposable, synthetic emulator data only."""
import json, sqlite3, time
from datetime import datetime, timedelta, timezone
from pathlib import Path

def data_cases(h):
    rooted=False

    def root_device():
        nonlocal rooted
        if rooted: return
        h.adb('root',check=False); h.adb('wait-for-device'); time.sleep(1)
        if h.adb('shell','id','-u')!='0': raise h.Blocked('Private test-data verification needs a rootable Google APIs emulator')
        rooted=True

    def database(label, restart=True):
        root_device()
        h.adb('shell','am','force-stop',h.PACKAGE)
        paths=h.adb('shell','find','/data/user/0/'+h.PACKAGE,'-name','runtrovert.db').splitlines()
        if len(paths)!=1: raise h.Blocked(f'Database not found: {paths}')
        folder=h.OUT/h.CURRENT/('database-'+label); folder.mkdir(parents=True,exist_ok=True)
        target=folder/'runtrovert.db'; h.adb('pull',paths[0],target)
        for suffix in ('-wal','-shm'): h.adb('pull',paths[0]+suffix,str(target)+suffix,check=False)
        with sqlite3.connect(target) as db:
            db.row_factory=sqlite3.Row
            tables=[r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            counts={t:db.execute('SELECT count(*) FROM "'+t+'"').fetchone()[0] for t in tables if not t.startswith('sqlite_')}
            runs=[dict(r) for r in db.execute('SELECT * FROM runs')]
            state={'counts':counts,'runs':runs,'integrity':db.execute('PRAGMA integrity_check').fetchone()[0]}
        (folder/'state.json').write_text(json.dumps(state,indent=2))
        h.log('database-verified',label=label,counts=counts,integrity=state['integrity'])
        if restart: h.launch()
        return state

    def seed_manual():
        h.fresh(); h.tap('Your runs'); h.tap('Add a run you didn’t record'); h.tap('A day earlier')
        h.type_in('Distance (km)','5'); h.type_in('Time as minutes, or 28:30, or 1:05:00.','30:00')
        h.type_in('A note, if you like','Synthetic_backup_fixture'); h.tap('Add this run'); h.expect('Added by hand')
        h.tap('Back to Your runs'); h.tap('Run')

    def open_data():
        h.settings_page('Backup, import and export')

    def backup_bytes():
        open_data(); h.tap('Make a backup file'); time.sleep(2); h.shot('backup-export-share')
        root_device()
        paths=h.adb('shell','find','/data/user/0/'+h.PACKAGE+'/cache','-name','*.runtrovert').splitlines()
        if not paths: raise h.Blocked('Generated backup file was not found')
        raw=h.adb('exec-out','cat',paths[-1],binary=True)
        h.back(); h.expect('Make a backup file')
        header=json.loads(raw.splitlines()[0]); assert header['counts']['runs']==1, header
        (h.OUT/h.CURRENT/'exported-backup.runtrovert').write_bytes(raw)
        return raw

    def push_fixture(name, raw):
        folder=h.OUT/h.CURRENT; folder.mkdir(exist_ok=True)
        p=folder/name; p.write_bytes(raw); h.adb('push',p,'/sdcard/Download/'+name)

    def choose_download(name):
        time.sleep(1)
        r,_=h.hierarchy()
        if h.find(name,r) is None:
            # Standard Android DocumentsUI roots; selectors inspected in snapshots.
            h.tap('Show roots',scrolls=0)
            h.tap('Downloads',scrolls=0)
        # Match the filename itself; contains also matches DocumentsUI's
        # separate "Preview the file ..." icon, which does not choose it.
        h.tap(name); time.sleep(1)

    def restore(name):
        h.tap('Restore from a file'); h.shot('restore-picker'); choose_download(name)

    def roundtrip():
        seed_manual(); raw=backup_bytes(); push_fixture('qa-valid-backup.runtrovert',raw)
        h.back(); h.back(); h.tap('Your runs'); h.first_history_run()
        h.tap('Delete run'); h.tap('Delete'); h.expect('No runs yet.')
        h.tap('Run'); open_data(); restore('qa-valid-backup.runtrovert'); h.expect('Restore this backup?'); h.shot('restore-confirmation')
        h.tap('Replace'); h.expect('Restored'); h.tap('OK'); time.sleep(2)
        state=database('roundtrip'); assert len(state['runs'])==1 and state['runs'][0]['distance_m']==5000, state
        assert state['runs'][0]['note']=='Synthetic_backup_fixture', state
        h.tap('Your runs'); h.first_history_run(); h.locate('Synthetic_backup_fixture'); h.expect('Synthetic_backup_fixture'); h.shot('restored-detail')

    def truncated():
        seed_manual(); raw=backup_bytes(); short=raw.splitlines()[0]+b'\n'
        push_fixture('qa-truncated-backup.runtrovert',short)
        restore('qa-truncated-backup.runtrovert'); r,_=h.hierarchy()
        if h.find('Couldn’t restore the backup',r) is not None:
            h.shot('corrupt-backup-rejected'); h.tap('OK')
        else:
            h.expect('Restore this backup?'); h.shot('truncated-confirmation-claims-one-run')
            h.tap('Replace'); h.expect('Restored'); h.shot('truncated-reported-success'); h.tap('OK'); time.sleep(2)
        state=database('after-truncated-restore',restart=False)
        assert len(state['runs'])==1, f'Truncated backup replaced 1 existing synthetic run with {len(state["runs"])}; declared header count was 1'

    def malformed_and_future():
        seed_manual(); raw=backup_bytes()
        push_fixture('qa-not-a-backup.runtrovert',b'broken backup bytes')
        restore('qa-not-a-backup.runtrovert'); h.expect('Couldn’t restore the backup'); h.shot('invalid-header'); h.tap('OK')
        lines=raw.splitlines(); header=json.loads(lines[0]); header['v']=999
        push_fixture('qa-newer-backup.runtrovert',json.dumps(header).encode()+b'\n'+b'\n'.join(lines[1:]))
        restore('qa-newer-backup.runtrovert'); h.expect('Couldn’t restore the backup'); h.shot('future-version'); h.tap('OK')
        push_fixture('qa-broken-row.runtrovert',lines[0]+b'\n[0, incomplete row\n')
        restore('qa-broken-row.runtrovert'); h.expect('Restore this backup?'); h.tap('Replace'); h.expect('Couldn’t restore the backup')
        h.expect('Nothing on this phone was changed.',contains=True); h.shot('rollback-error'); h.tap('OK')
        state=database('rollback',restart=False); assert len(state['runs'])==1, state

    def gpx_import():
        h.fresh(); root_device()
        start=datetime(2026,10,1,8,0,tzinfo=timezone.utc)
        pts=''.join(f'<trkpt lat="{41.8902+i*.000015:.7f}" lon="{12.4924+i*.00005:.7f}"><ele>25</ele><time>{(start+timedelta(seconds=2*i)).strftime("%Y-%m-%dT%H:%M:%SZ")}</time></trkpt>' for i in range(151))
        data=('<?xml version="1.0"?><gpx version="1.1" creator="RuntrovertQA" xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Synthetic Rome test</name><type>running</type><trkseg>'+pts+'</trkseg></trk></gpx>').encode()
        push_fixture('qa-synthetic-running.gpx',data)
        open_data(); h.tap('Choose files'); choose_download('qa-synthetic-running.gpx'); h.locate('Brought in 1 run.',contains=True); h.expect('Brought in 1 run.',contains=True); h.shot('gpx-imported')
        h.tap('Choose files'); choose_download('qa-synthetic-running.gpx'); h.shot('duplicate-import')
        state=database('import-once'); assert len(state['runs'])==1 and state['counts']['points']>100,state
        h.tap('Your runs'); h.first_history_run(); h.shot('imported-route')
        h.tap('Save as GPX'); time.sleep(1); h.shot('gpx-share'); h.back()
        h.tap('Save as a place'); h.shot('place-form')
        h.type_in('Name of this place','QA Rome route'); h.tap('Keep this place')
        h.expect('One of your places: QA Rome route'); h.tap('One of your places: QA Rome route'); h.shot('saved-place')
        h.tap('Run this again'); h.expect('Your route'); h.shot('route-ready')
        state=database('saved-place',restart=False); assert state['counts']['places']==1, state

    def process_death():
        h.fresh(); h.begin(); time.sleep(15); h.shot('before-process-death')
        h.adb('shell','am','force-stop',h.PACKAGE); time.sleep(3); h.launch()
        h.expect('Pause',timeout=20); h.shot('recovered-recording'); h.finish()
        state=database('recovered-run',restart=False)
        assert len(state['runs'])==1 and state['runs'][0]['ended_at'] is not None, state
        assert state['counts']['points']>1, 'Recovered run has no recorded synthetic route'

    return [('15-backup-roundtrip',roundtrip),('16-truncated-backup-safety',truncated),
            ('17-malformed-backup-rollback',malformed_and_future),('18-gpx-import-deduplication',gpx_import),
            ('19-process-death-recovery',process_death)]
