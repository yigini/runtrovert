"""Extra black-box journeys, source-mapped to Runtrovert build 157.

Only synthetic data on the disposable emulator. No app-source access, database
injection, purchase, real health answers, external media launch or messaging.
Usage: from android_extra_journeys import extra_cases; CASES += extra_cases(h)
where h is the loaded android-user-journeys driver module.
"""
import re
import time


QUESTIONS = [
    'Has a doctor ever said you have a heart condition, or that you should only exercise under medical supervision?',
    'Do you feel pain in your chest when you exercise, or have you had chest pain at rest in the past month?',
    'Do you lose your balance because of dizziness, or have you lost consciousness in the past year?',
    'Do you have a bone, joint or tendon problem that running could make worse?',
    'Do you take medication for blood pressure, a heart condition or diabetes?',
    'Are you pregnant, or have you given birth in the last six months?',
    'Is there any other reason you should not run, or an injury from the last three months that still bothers you?',
]
WEEKDAY = r'(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)'


def extra_cases(h):
    """Return independent cases; the supplied driver owns evidence/reporting."""

    def shown(query, **kw):
        # Driver expect intentionally does not scroll; locate establishes reachability.
        h.locate(query, **kw)
        h.expect(query, contains=kw.get('contains', False), regex=kw.get('regex', False))

    def tap_node(n, reason):
        x1, y1, x2, y2 = h.bounds(n)
        x, y = (x1 + x2) // 2, (max(70, y1) + min(h.SIZE[1] - 65, y2)) // 2
        if x2 <= x1 or y2 <= y1:
            raise h.Blocked('Empty bounds for ' + reason)
        h.log('tap-scoped-node', label=reason, bounds=n.get('bounds'))
        h.adb('shell', 'input', 'tap', x, y)
        time.sleep(.6)

    def top():
        for _ in range(7):
            h.scroll('up')

    def chosen(n):
        return n.get('selected') == 'true' or n.get('checked') == 'true'

    def health_choice(question, answer):
        """Select the answer belonging to this exact question, never generic No."""
        for attempt in range(12):
            root, _ = h.hierarchy()
            q = h.find(question, root)
            if q is not None:
                parents = {child: parent for parent in root.iter() for child in parent}
                ancestor = parents.get(q)
                candidate = None
                # Prefer a retained native question container with one answer pair.
                while ancestor is not None:
                    matches = [n for n in ancestor.iter('node')
                               if n.get('clickable') == 'true'
                               and h.match(n, answer) and h.visible(n)]
                    questions = [n for n in ancestor.iter('node')
                                 if n.get('text') in QUESTIONS or n.get('content-desc') in QUESTIONS]
                    if len(matches) == 1 and len(questions) == 1:
                        candidate = matches[0]
                        break
                    ancestor = parents.get(ancestor)
                if candidate is None:
                    # Compressed hierarchies may flatten the container. Scope by
                    # question-bottom and the next visible question, using observed bounds.
                    q_bottom = h.bounds(q)[3]
                    next_top = min([h.bounds(n)[1] for n in root.iter('node')
                                    if (n.get('text') in QUESTIONS or n.get('content-desc') in QUESTIONS)
                                    and h.bounds(n)[1] > h.bounds(q)[1]], default=h.SIZE[1] - 65)
                    matches = [n for n in root.iter('node')
                               if n.get('clickable') == 'true' and h.match(n, answer)
                               and h.visible(n) and h.bounds(n)[1] >= q_bottom - 6
                               and (h.bounds(n)[1] + h.bounds(n)[3]) // 2 < next_top]
                    if len(matches) == 1:
                        candidate = matches[0]
                if candidate is not None:
                    if not chosen(candidate):
                        tap_node(candidate, question + ' -> ' + answer)
                    h.log('health-fixture-answer', question=question, answer=answer,
                          synthetic_persona=True)
                    return
                # The question can be visible while its answer row is below the fold.
                w, height = h.SIZE
                h.adb('shell', 'input', 'swipe', w // 2, int(height * .72),
                      w // 2, int(height * .50), 350)
                time.sleep(.35)
            else:
                h.scroll()
        raise h.Blocked('Could not scope health answer to: ' + question)

    def open_health():
        h.tap('Train')
        h.tap('Start running')
        shown('Start running')
        h.shot('plan-setup')
        # Source hides this choice on Mondays; inspect the emulator's local day.
        monday = h.adb('shell', 'date', '+%u').strip() == '1'
        if not monday:
            h.tap('Next Monday', scrolls=10)
        h.tap('Start this plan', scrolls=10)
        h.expect('Seven questions.')
        n = h.locate('Start the plan', scrolls=10)
        assert n.get('enabled') == 'false', 'Unanswered health questions allowed plan start'
        h.shot('health-unanswered-disabled')
        top()

    def answer_all(first='No'):
        for i, question in enumerate(QUESTIONS):
            health_choice(question, first if i == 0 else 'No')

    def make_plan():
        h.fresh()
        open_health()
        answer_all()
        n = h.locate('Start the plan', scrolls=10)
        assert n.get('enabled') != 'false', 'Seven answered No questions did not enable plan start'
        h.shot('health-complete')
        h.tap('Start the plan', scrolls=0)
        shown('See this week', scrolls=10)
        h.shot('plan-created-explanation')
        h.tap('See this week')
        shown('Next week, week 2', scrolls=8)
        h.shot('plan-week-one')

    def mode_fallback():
        h.fresh()
        h.tap('Today’s run:', contains=True)
        h.expect('What kind of run today?')
        h.tap('Follow my plan', contains=True)
        h.tap('Done')
        h.expect('Today’s run: Just run')
        shown('Nothing on the plan today, so this one runs as Just run. Plans live in Train.')
        h.shot('plan-mode-without-plan')
        h.adb('shell', 'am', 'force-stop', h.PACKAGE)
        h.launch()
        h.expect('Today’s run: Just run')
        h.tap('Today’s run:', contains=True)
        n = h.locate('Follow my plan.', contains=True)
        assert chosen(n), 'Requested Follow my plan preference did not persist'
        h.tap('Just run.', contains=True)
        h.tap('Done')
        h.expect('Today’s run: Just run')
        h.settings_page('During a run')
        h.tap('Countdown: 10')
        h.back()
        h.back()
        h.tap('Start')
        h.allow_remaining()
        h.tap('Cancel', scrolls=0)
        h.expect('Start')
        h.not_visible('Pause')
        h.tap('Your runs')
        h.expect('No runs yet.')
        h.shot('countdown-cancel-preserves-empty-history')

    def plan_session():
        make_plan()
        h.tap('Next week, week 2')
        shown('Back to this week', scrolls=2)
        h.shot('plan-week-two')
        h.tap('Back to this week')
        # Start-running week 1 sessions are Run <duration> × <repetitions>.
        # DayRow's description includes full weekday/date and session title.
        h.tap(r'^(?:Today, )?' + WEEKDAY + r'.*\. Run .+ × ', regex=True, scrolls=10)
        shown('Skip it', scrolls=8)
        h.shot('plan-session-detail')
        h.tap('Skip it')
        h.expect('Skip this session?')
        h.tap('Keep')
        shown('Did it without the app')
        h.tap('Did it without the app')
        h.expect('Mark as done?')
        h.tap('Cancel')
        top()
        h.tap(r'^(Start this session|Do it today instead|Start it now anyway)$',
              regex=True, scrolls=10)
        h.expect('Start today’s session')
        h.not_visible('Pause')
        h.shot('specific-plan-session-queued')
        h.begin('Start today’s session')
        h.expect('Block 1', contains=True)
        h.shot('specific-plan-session-recording')
        h.finish()

    def health_warning():
        h.fresh()
        open_health()
        answer_all(first='Yes')
        shown('Talk to a doctor first.', scrolls=10)
        shown('A doctor has cleared me. Start', scrolls=4)
        h.shot('health-warning-no-clearance-asserted')
        # This is a synthetic warning test. Never claim clearance or press Start.
        h.tap('Not now')
        shown('Start this plan', scrolls=10)
        h.shot('health-warning-back-to-setup')
        h.back()
        h.tap('Run')
        h.expect('Start')
        h.not_visible('Start today’s session')
        h.shot('health-warning-created-no-plan')

    def life_changes():
        make_plan()
        h.tap('Pause the plan', scrolls=16)
        shown('Resume the plan', scrolls=4)
        h.shot('plan-paused')
        h.adb('shell', 'am', 'force-stop', h.PACKAGE)
        h.launch()
        h.tap('Train')
        shown('Resume the plan', scrolls=16)
        h.shot('plan-pause-persisted')
        h.tap('Resume the plan')
        shown('Pause the plan')
        # Explore and cancel before committing synthetic planned rest.
        top()
        h.tap('I’m away for a few days', scrolls=16)
        shown('Planned rest,', contains=True)
        h.shot('planned-rest-form')
        h.back()
        h.tap('I’m away for a few days', scrolls=16)
        h.tap(r'^Away .+ to .+$', regex=True, scrolls=8)
        shown('What changed along the way', scrolls=16)
        shown(r'Away .+ to .+\.', regex=True, scrolls=4)
        h.shot('planned-rest-applied')
        top()
        h.tap('I’m ill', scrolls=16)
        shown('No running with a fever', contains=True)
        h.shot('illness-form')
        h.tap('Rest 3 days, then easy', scrolls=8)
        shown('What changed along the way', scrolls=16)
        shown('Ill for 3 days.', contains=True, scrolls=4)
        h.shot('illness-applied')
        top()
        h.tap('Stop this plan', scrolls=16)
        h.expect('Stop this plan?')
        h.tap('Keep going')
        shown('Stop this plan')
        h.tap('Stop this plan')
        h.tap('Stop plan')
        shown('Quick workout')
        h.shot('plan-stopped-catalogue')

    def listen_choices():
        h.fresh()
        h.tap('Listen')
        h.expect('Something to take with you. Or nothing at all.')
        h.tap(r'^Music: .*\. Change$', regex=True)
        h.expect('Music from')
        h.shot('music-app-chooser')
        h.back()
        h.tap(r'^Podcasts: .*\. Change$', regex=True)
        h.expect('Podcasts in')
        h.shot('podcast-app-chooser')
        h.back()
        h.tap('Run in silence today')
        n = h.locate('Run in silence today')
        assert n.get('checked') == 'true', 'Silence switch did not switch on'
        h.shot('one-day-silence')
        h.tap('Back to Start')
        h.expect('Start')
        h.tap('Listen')
        n = h.locate('Run in silence today')
        assert n.get('checked') == 'true', 'Silence choice lost on reopening'
        h.tap('Run in silence today')
        h.tap('Browse every shelf')
        shown('Voices to take with you.', contains=True)
        h.shot('listen-full-screen')
        shown("Get today's episodes and covers?", scrolls=12)
        h.shot('listen-download-disclosure')
        h.tap('No thanks')
        h.not_visible("Get today's episodes and covers?")
        h.shot('listen-download-declined')
        # Actual pickers are tested without launching a third-party media app.
        top()
        h.tap('Music:', contains=True)
        h.expect('Music from')
        h.back()
        h.back()
        h.expect('Start')
        h.settings_page('Music and podcasts')
        n = h.locate('Daily list: Off', scrolls=8)
        assert chosen(n), 'Declining Listen download did not persist as Off in Settings'
        h.shot('listen-privacy-setting-off')
        h.back()
        h.back()
        h.expect('Start')

    return [
        ('20-mode-fallback-countdown-cancel', mode_fallback),
        ('21-plan-setup-session-guidance', plan_session),
        ('22-plan-health-warning-cancel', health_warning),
        ('23-plan-pause-rest-ill-stop', life_changes),
        ('24-listen-choices-privacy-cancel', listen_choices),
    ]
