#!/usr/bin/env python3
"""Black-box tests of the installed release APK; only synthetic device data.

Selectors come from the accessibility hierarchy. Failed navigation is reported
as blocked for inspection, not automatically classified as a product defect.
"""
import json, os, re, subprocess, sys, threading, time, traceback
from pathlib import Path
import xml.etree.ElementTree as ET

OUT = Path('evidence/journeys'); OUT.mkdir(parents=True, exist_ok=True)
PACKAGE = 'app.runtrovert'
RESULTS, TRACE = [], []
CURRENT = 'setup'
SIZE = (1080, 2400)
GPS_STOP = threading.Event()

class Blocked(Exception): pass

def adb(*args, check=True, timeout=30, binary=False):
    p = subprocess.run(['adb', *map(str,args)], capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise Blocked(f'adb {args}: {p.stderr.decode(errors="replace")}')
    return p.stdout if binary else p.stdout.decode(errors='replace').strip()

def log(action, **data):
    row = dict(time=round(time.time(),3), case=CURRENT, action=action, **data)
    TRACE.append(row)
    print(json.dumps(row, ensure_ascii=False), flush=True)
    (OUT/'trace.json').write_text(json.dumps(TRACE, ensure_ascii=False, indent=2))

def hierarchy():
    for attempt in range(3):
        try:
            adb('shell','uiautomator','dump','--compressed','/sdcard/rt-ui.xml',timeout=18)
            xml = adb('exec-out','cat','/sdcard/rt-ui.xml',timeout=10)
            root = ET.fromstring(xml)
            return root, xml
        except Exception:
            if attempt == 2: raise Blocked('Could not read accessibility hierarchy')
            time.sleep(1)

def labels(root):
    return [n.get(k,'') for n in root.iter('node') for k in ('text','content-desc') if n.get(k)]

def bounds(n):
    v = list(map(int, re.findall(r'\d+',n.get('bounds',''))))
    return v if len(v)==4 else [0,0,0,0]

def visible(n):
    x1,y1,x2,y2=bounds(n)
    return x2>x1 and y2>y1 and x1<SIZE[0] and y1<SIZE[1]-55 and y2>70

def match(n, query, contains=False, regex=False):
    vals=[n.get('text',''),n.get('content-desc',''),n.get('resource-id','')]
    if regex: return any(re.search(query,v,re.I) for v in vals if v)
    if contains: return any(query.casefold() in v.casefold() for v in vals if v)
    return query in vals

def find(query, root=None, contains=False, regex=False, editable=False):
    if root is None: root,_=hierarchy()
    candidates=[n for n in root.iter('node') if visible(n) and match(n,query,contains,regex)]
    if editable: candidates=[n for n in candidates if n.get('class')=='android.widget.EditText']
    candidates.sort(key=lambda n: (n.get('clickable')!='true' and n.get('class')!='android.widget.EditText', bounds(n)[1]))
    return candidates[0] if candidates else None

def scroll(direction='down'):
    w,h=SIZE
    a,b=(int(h*.77),int(h*.32)) if direction=='down' else (int(h*.32),int(h*.77))
    adb('shell','input','swipe',w//2,a,w//2,b,450)
    time.sleep(.35)

def locate(query, contains=False, regex=False, editable=False, scrolls=5):
    for attempt in range(scrolls+1):
        r,_=hierarchy(); n=find(query,r,contains,regex,editable)
        if n is not None: return n
        # Accessible Pressables sometimes concatenate their children's labels.
        if not contains and not regex and not editable:
            n=find(r'^'+re.escape(query)+r'(?:\s|\.|,|$)',r,regex=True)
            if n is not None: return n
        if attempt<scrolls: scroll()
    raise Blocked(f'Could not find {query!r}; visible labels: {labels(r)}')

def tap(query, contains=False, regex=False, hold=0, scrolls=5):
    n=locate(query,contains,regex,scrolls=scrolls); x1,y1,x2,y2=bounds(n)
    x=(x1+x2)//2; y=(max(y1,70)+min(y2,SIZE[1]-65))//2
    log('tap',label=query,bounds=n.get('bounds'),hold=hold)
    if hold: adb('shell','input','swipe',x,y,x,y,hold)
    else: adb('shell','input','tap',x,y)
    time.sleep(.55)

def type_in(query, value):
    n=locate(query,editable=True); x1,y1,x2,y2=bounds(n)
    adb('shell','input','tap',(x1+x2)//2,(y1+y2)//2)
    adb('shell','input','keyevent','KEYCODE_MOVE_END')
    old=n.get('text','')
    if old: adb('shell','input','keyevent',*(['67']*min(150,len(old)+3)))
    adb('shell','input','text',value.replace(' ','%s'))
    adb('shell','input','keyevent','KEYCODE_BACK')
    log('type',label=query,value=value)
    time.sleep(.5)

def expect(query, contains=False, regex=False, timeout=12):
    deadline=time.time()+timeout
    while True:
        root,_=hierarchy()
        if find(query,root,contains,regex) is not None:
            log('assert-visible',label=query); return
        if time.time()>deadline: raise AssertionError(f'Expected {query!r}; visible: {labels(root)}')
        time.sleep(.5)

def not_visible(query):
    r,_=hierarchy()
    assert find(query,r) is None, f'Unexpected visible {query!r}'
    log('assert-absent',label=query)

def shot(name):
    folder=OUT/CURRENT; folder.mkdir(exist_ok=True)
    p=folder/(name+'.png'); p.write_bytes(adb('exec-out','screencap','-p',binary=True))
    assert p.read_bytes().startswith(b'\x89PNG'), 'Invalid screenshot'
    try:
        r,xml=hierarchy(); (folder/(name+'.xml')).write_text(xml)
        (folder/(name+'.labels.json')).write_text(json.dumps(labels(r),ensure_ascii=False,indent=2))
    except Exception as e: log('hierarchy-unavailable',detail=str(e))
    log('screenshot',path=str(p))

def back():
    adb('shell','input','keyevent','KEYCODE_BACK'); time.sleep(.6)

def launch():
    adb('shell','am','start','-W','-n',PACKAGE+'/.MainActivity'); time.sleep(2)

def onboard():
    tap('I like that'); tap('Not now'); expect('Your runs'); expect('Train')

def fresh(onboarding=True, permissions=True):
    adb('shell','am','force-stop',PACKAGE)
    adb('shell','pm','clear',PACKAGE)
    adb('shell','settings','put','system','font_scale','1.0')
    adb('shell','svc','wifi','enable',check=False); adb('shell','svc','data','enable',check=False)
    if permissions:
        for p in ('ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION','ACCESS_BACKGROUND_LOCATION','POST_NOTIFICATIONS'):
            adb('shell','pm','grant',PACKAGE,'android.permission.'+p,check=False)
    launch()
    if onboarding: onboard()

def settings_page(name):
    tap('Settings'); tap(name,contains=True)

def finish(save=True):
    tap('Stop run',hold=1400,scrolls=0)
    r,_=hierarchy()
    if find('Barely moved.',r) is not None: tap('Save run')
    expect('Run done'); shot('finish')
    if save:
        tap('Save run'); expect('Back to Your runs'); shot('saved')

def allow_remaining():
    for _ in range(5):
        r,_=hierarchy()
        options=['com.android.permissioncontroller:id/permission_allow_foreground_only_button',
                 'com.android.permissioncontroller:id/permission_allow_button',
                 'com.android.permissioncontroller:id/permission_allow_one_time_button','Run anyway','Got it','OK']
        found=next((q for q in options if find(q,r) is not None),None)
        if found: tap(found,scrolls=0)
        else: break

def begin(label='Start'):
    tap(label); allow_remaining(); time.sleep(5); expect('Pause',timeout=20)

def first_history_run():
    tap(r'(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday).*in .*minute',regex=True)

def gps_loop():
    step=0
    while not GPS_STOP.is_set():
        # A public, synthetic route near Rome, unrelated to the user's location.
        lon=12.4924+step*.000055; lat=41.8902+step*.00001
        adb('emu','geo','fix',f'{lon:.7f}',f'{lat:.7f}','25','8',check=False)
        step=(step+1)%250
        GPS_STOP.wait(2)

def case(name, fn):
    global CURRENT
    CURRENT=name; start=time.time(); log('case-start')
    try:
        fn(); result={'name':name,'status':'passed'}
    except Exception as e:
        result={'name':name,'status':'blocked' if isinstance(e,Blocked) else 'failed','error':str(e)}
        log('case-error',detail=str(e),traceback=traceback.format_exc())
        try: shot('failure')
        except Exception: pass
    result['seconds']=round(time.time()-start,1); RESULTS.append(result)
    (OUT/'results.json').write_text(json.dumps(RESULTS,ensure_ascii=False,indent=2))
    log('case-end',**result)

def welcome_copy():
    fresh(False,False); shot('welcome')
    r,_=hierarchy(); broken=[x for x in labels(r) if '\\n' in x]
    assert not broken, f'Literal newline escape visible: {broken}'

def navigation():
    fresh(permissions=False); shot('home')
    tap('Your runs'); expect('No runs yet.'); shot('empty-history')
    tap('Places'); shot('empty-places')
    tap('Patterns'); shot('empty-patterns')
    tap('Train'); expect('Quick workout',contains=True); shot('training-catalogue')
    tap('Run'); expect('Settings'); shot('return-home')
    adb('shell','am','force-stop',PACKAGE); launch(); expect('Your runs'); not_visible('I like that')

def deny_location():
    fresh(permissions=False); tap('Start')
    tap('com.android.permissioncontroller:id/permission_deny_button',scrolls=0)
    expect('Location needed'); shot('location-denied'); tap('Cancel'); expect('Start'); not_visible('Pause')
    shot('returned-to-home')

def missing_background():
    fresh(permissions=False)
    for p in ('ACCESS_COARSE_LOCATION','ACCESS_FINE_LOCATION'):
        adb('shell','pm','grant',PACKAGE,'android.permission.'+p)
    tap('Start'); time.sleep(1); shot('background-permission')
    r,_=hierarchy()
    if find('Background location',r) is None:
        # Android may open the app's system permission page on this first request.
        back()
    expect('Background location'); tap('Cancel'); expect('Start'); not_visible('Pause')

def record_run():
    fresh(); begin(); shot('recording')
    tap('Show map'); shot('live-map'); tap('Show numbers')
    time.sleep(12); tap('Lap'); shot('lap')
    tap('Pause'); expect('Resume'); shot('paused'); tap('Resume'); expect('Pause')
    adb('shell','input','keyevent','KEYCODE_HOME'); time.sleep(8); launch(); expect('Pause'); shot('background-return')
    adb('shell','input','keyevent','KEYCODE_SLEEP'); time.sleep(8)
    adb('shell','input','keyevent','KEYCODE_WAKEUP'); adb('shell','wm','dismiss-keyguard'); launch(); expect('Pause')
    finish(); tap('Back to Your runs'); expect('Your runs'); not_visible('No runs yet.'); shot('history')
    adb('shell','am','force-stop',PACKAGE); launch(); tap('Your runs'); not_visible('No runs yet.'); first_history_run(); shot('persistent-detail')

def finish_recovery():
    fresh(); begin(); finish(False)
    tap('Resume run'); expect('Pause'); shot('resumed')
    finish(False); back(); expect('Save this run?'); shot('unsaved-back-confirmation')
    tap('Not yet'); expect('Run done'); tap('Discard run'); expect('Discard run?'); tap('Keep'); expect('Run done')
    tap('Discard run'); tap('Discard run'); expect('Start'); tap('Your runs'); expect('No runs yet.')

def quiet_mode():
    fresh(); tap('Today’s run:',contains=True); tap('Clear my head'); tap('Done')
    expect('Today’s run: Clear my head'); begin(); expect('Clear my head'); expect('Show the time'); shot('quiet')
    tap('Show the time'); expect('so far',contains=True); shot('quiet-time')
    tap('Pause'); expect('Paused. Nothing is recording.'); tap('Resume'); finish()

def manual_entry():
    fresh(); tap('Your runs'); tap('Add a run you didn’t record'); tap('A day earlier')
    type_in('Distance (km)','5'); type_in('Time as minutes, or 28:30, or 1:05:00.','1:00'); tap('Add this run')
    expect('That’s faster than 2 minutes per km. Check the distance and the time.'); shot('invalid-entry')
    type_in('Time as minutes, or 28:30, or 1:05:00.','30:00'); type_in('A note, if you like','CI_manual_157'); tap('Add this run')
    expect('Added by hand'); shot('manual-saved')
    tap('Correct distance or time'); type_in('Distance (km)','6'); type_in('Time as minutes, or 28:30, or 1:05:00.','36:00'); tap('Save correction')
    expect('Put back what was recorded'); shot('corrected')
    tap('Put back what was recorded'); expect('Correct distance or time'); shot('correction-restored')
    type_in('A note, if you want','CI_note_persisted'); tap('Back to Your runs')
    first_history_run(); expect('CI_note_persisted'); shot('note-persisted')
    tap('Delete run'); expect('Delete run?'); tap('Keep'); expect('Delete run')
    tap('Delete run'); tap('Delete'); expect('No runs yet.'); shot('deleted')

def quick_workout():
    fresh(); tap('Train'); tap('Quick workout'); tap('Run 1, walk 1'); shot('quick-builder')
    tap('Start this workout'); expect('Your quick workout'); shot('queued-workout')
    begin('Start today’s session'); expect('Block 1',contains=True); shot('guided-workout'); finish()

def settings_sweep():
    fresh(); tap('Settings'); shot('settings-hub')
    pages=['During a run','GPS and battery','Map','Watch and heart rate','Music and podcasts','Quiet reminders','Home and work','Weather and extras','Language','Appearance','What leaves this phone','Backup, import and export','Credits and licences']
    missing=[]
    for name in pages:
        try:
            tap(name,contains=True); shot(re.sub(r'[^a-z0-9]+','-',name.lower()))
            back(); expect('Settings')
            # Return to top of the settings hub before seeking the next row.
            for _ in range(3): scroll('up')
        except Blocked as e:
            missing.append(name); log('page-not-reached',page=name,error=str(e)); back()
    expect('Settings')
    if missing: raise Blocked(f'Settings pages not reached: {missing}')

def units_theme():
    fresh(); settings_page('During a run'); tap('mi'); shot('miles-selected'); back(); tap('Appearance'); tap('Dark'); shot('dark-settings'); back(); back()
    adb('shell','am','force-stop',PACKAGE); launch(); settings_page('During a run')
    n=locate('mi'); assert n.get('selected')=='true' or n.get('checked')=='true', 'Miles selection did not persist in accessibility state'
    shot('units-persisted'); back(); tap('Appearance'); shot('theme-persisted')

def large_text():
    fresh(False,False); adb('shell','settings','put','system','font_scale','2.0'); time.sleep(2); shot('large-welcome')
    onboard(); shot('large-home'); tap('Your runs'); shot('large-history'); tap('Add a run you didn’t record'); shot('large-manual-form'); back()
    tap('Train'); tap('Quick workout'); shot('large-quick'); tap('Start this workout'); expect('Start today’s session'); shot('large-start')
    adb('shell','settings','put','system','font_scale','1.0')

def offline_run():
    fresh(); adb('shell','svc','wifi','disable'); adb('shell','svc','data','disable')
    begin(); shot('offline-recording'); time.sleep(8); finish(); tap('Back to Your runs'); not_visible('No runs yet.'); shot('offline-history')

def import_cancel_backup():
    fresh(); settings_page('Backup, import and export'); shot('data-tools')
    tap('Restore from a file'); shot('restore-picker'); back(); expect('Restore from a file')
    tap('Choose files'); shot('import-picker'); back(); expect('Choose files')
    tap('Make a backup file'); time.sleep(2); shot('backup-share-sheet'); back(); expect('Make a backup file')

CASES=[('01-welcome-copy',welcome_copy),('02-onboarding-navigation',navigation),
 ('03-location-denied',deny_location),('04-background-permission-cancel',missing_background),
 ('05-record-pause-background-save',record_run),('06-finish-recovery-discard',finish_recovery),
 ('07-quiet-mode',quiet_mode),('08-manual-validation-edit-delete',manual_entry),
 ('09-quick-workout',quick_workout),('10-settings-pages',settings_sweep),
 ('11-units-theme-persistence',units_theme),('12-large-text',large_text),
 ('13-offline-recording',offline_run),('14-data-tools-cancellation',import_cancel_backup)]

if __name__=='__main__':
    size=adb('shell','wm','size'); numbers=re.findall(r'(\d+)x(\d+)',size)
    if numbers: SIZE=tuple(map(int,numbers[-1]))
    adb('logcat','-c'); adb('logcat','-b','crash','-c')
    threading.Thread(target=gps_loop,daemon=True).start()
    chosen=set(filter(None,os.environ.get('RT_CASES','').split(',')))
    for name,fn in CASES:
        if not chosen or name in chosen: case(name,fn)
    GPS_STOP.set()
    adb('shell','settings','put','system','font_scale','1.0',check=False)
    adb('shell','svc','wifi','enable',check=False); adb('shell','svc','data','enable',check=False)
    (OUT/'crashes.txt').write_text(adb('logcat','-b','crash','-d',check=False))
    (OUT/'logcat.txt').write_text(adb('logcat','-d','-v','threadtime',check=False))
    counts={s:sum(r['status']==s for r in RESULTS) for s in ('passed','failed','blocked')}
    summary='## Android user journeys\n\n'+json.dumps(counts)+'\n\n'+'\n'.join(f"- {r['status']}: {r['name']}" for r in RESULTS)+'\n'
    (OUT/'summary.md').write_text(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as f: f.write(summary)
    print(summary,flush=True)
    sys.exit(1 if counts['failed'] or counts['blocked'] else 0)
