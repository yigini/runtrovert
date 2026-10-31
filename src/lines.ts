/**
 * Notification lines. Every one is original.
 *
 * THE VOICE: observant, warm, precise, occasionally dry. Read every line,
 * in every language pack, against these before it ships:
 *  - Observe what the app actually knows (your runs, your usual hour, the
 *    forecast). Never claim what it can't: no "the park is empty", "nobody
 *    will be out", "it's quiet now", "it's safe".
 *  - Never argue with the runner's body. Low energy, pain and rest are
 *    answers, not excuses, and never something to talk someone out of.
 *  - Never shame, never shout, never guilt, never "streak".
 *  - The point is your own space, not getting away from people. Other people
 *    are not the problem; don't joke as if they were.
 *  - Dry is welcome now and then. Warm comes first.
 *  - Never mention the unlock or anything for sale.
 * With "Fewer words" on (Settings), the PLAIN lines below are used instead:
 * the plain fact, no joke.
 *
 * Moods:
 *  nudge     – ordinary day, gentle invitation
 *  rest      – ran yesterday or today; rest is the message
 *  quiet     – 3–6 days since the last run
 *  gap       – 7+ days; welcome back, no guilt
 *  weather   – rain / cold / dark
 *  morning   – early slot
 *  evening   – late slot
 */
export type Mood = 'nudge' | 'rest' | 'quiet' | 'gap' | 'weather' | 'morning' | 'evening';

export const LINES: Record<Mood, string[]> = {
  nudge: [
    'Hi there. Early runs have a light of their own. Just saying.',
    'No pressure. But your shoes looked at the door again.',
    'Small run, small-talk-free. Twenty minutes?',
    'Headphones optional. People optional. Run recommended.',
    'The route you like is still there. It kept the spot.',
    'A run is a meeting with one attendee. Attendance is great.',
    'Out there, nobody needs anything from you.',
    'Today could use a loop. Any loop. Even a small one.',
    'You don’t have to talk to anyone to lace up.',
    'Out, back, shower, quiet. A good afternoon, honestly.',
    'The pavement has no opinions about your pace.',
    'A run counts even if nobody knows about it. Especially then.',
    'Quick one? The world will still be loud when you get back.',
    'Shoes: by the door. Route: where you left it. The rest is up to you.',
    'Thirty minutes where your phone only counts kilometres.',
    'Running is the one hobby where leaving early is called finishing.',
    'Not feeling it today? That’s an answer too. The route will keep.',
    'One run, your pace, your route. Reasonable deal.',
    'The best part of a run is the bit where nobody can reach you.',
    'A gentle reminder that you own a pair of running shoes.',
    'Not a push. A nudge. The difference is about five minutes.',
    'There is a version of today with a short run in it. Your call.',
    'If you need a reason: there isn’t one. That’s allowed.',
    'A run is a long walk that’s in a hurry to be alone.',
    'Your route misses you. Routes don’t say that often.',
    'Twenty minutes outside beats twenty minutes of thinking about it.',
    'It’s a good day to be a dot moving across a map.',
    'A group run of one: you set the pace and the route.',
    'Reminder: fresh air is free and asks no questions.',
  ],
  rest: [
    'Yesterday’s run is still counting. Rest is part of the plan.',
    'You ran. Today the job is sitting down and being pleased about it.',
    'Rest day. Your legs are quietly rebuilding. Let them.',
    'Nothing to do today. That was the point of yesterday.',
    'Recovery is also running. Just the invisible kind.',
    'Good run yesterday. Today, be mildly insufferable about it, privately.',
    'The muscles are at work. You are not required to supervise.',
    'A day off keeps the running from becoming a chore. Enjoy the sofa.',
    'You earned a slow day. Collect it.',
    'Post-run report: energy up, world still too loud. Both normal.',
    'Nothing to prove today. Already done.',
    'Your legs would like a word: thank you, and please, not today.',
    'Rest well. The road is patient and so is this app.',
    'Running yesterday was the hard part. Resting today is the smart part.',
    'Two days in a row is allowed. So is one. You pick.',
  ],
  quiet: [
    'It’s been a few days. The route didn’t go anywhere.',
    'Quiet week? A short run is a good way to end it.',
    'No run in a bit. No problem. One easy loop resets everything.',
    'A few days off is normal. A few more is also normal. Either way, hello.',
    'The shoes are getting suspicious. Reassure them.',
    'If the week got loud, a run is the quietest room you own.',
    'Gentle reminder: a bad short run is better than a great planned one.',
    'Haven’t run this week? The week isn’t over, and nobody’s keeping score.',
    'A run would fix roughly one thing today. That’s a decent ratio.',
    'Your pace from last week is unbothered. It’ll wait.',
    'Restarting is just starting with better shoes.',
    'The hardest kilometre is the one between the door and the pavement.',
  ],
  gap: [
    'A week off happens. The road didn’t go anywhere.',
    'Hi again. No lecture. Just a door, and a route past it.',
    'Life got in the way. Life does that. A short run gets it back out.',
    'Welcome back, whenever that is. There’s no form to fill in.',
    'A long gap just means the first run back will feel like a discovery.',
    'Nothing is lost. Fitness is loyal; it leaves slowly and comes back quickly.',
    'No streak to rescue. Just a run to enjoy, if you fancy it.',
    'Start small. The map doesn’t care how small.',
    'Someone has to run that loop again. It might as well be you.',
    'You don’t owe anyone a comeback. You can just go for a run.',
    'If today is the day: lovely. If not: tomorrow is also a day.',
    'The first run back is mostly about proving the shoes still fit.',
  ],
  weather: [
    'It’s raining. Fewer people tend to go out in it, if that helps.',
    'Cold out. Layers on, and the first kilometre warms you up.',
    'Grey skies, soft light. A good day for an easy one.',
    'Dark early. Headlamp on. The world shrinks to one quiet circle.',
    'Drizzle is the introvert’s crowd control.',
    'Wind in your face means the route is doing half the thinking.',
    'Not the nicest weather. A short loop still counts.',
    'Puddles don’t make conversation. Ideal running companions.',
    'A run in the rain is a shower you take on the way to the shower.',
    'The fog is in. The world is about fifty metres wide today.',
  ],
  morning: [
    'Good morning. One short note, then I’ll leave you be.',
    'The streets are still asleep. Join them, moving.',
    'Early run: the day hasn’t started asking things of you yet.',
    'Morning. The light is low and the air is new.',
    'Sunrise runs: the day starts on your terms.',
    'Coffee, shoes, door. Conversation not required.',
    'The quiet hour is open. Reservation for one.',
    'Morning light and a route you know. Hard to improve on.',
  ],
  evening: [
    'Evening. The day is done talking. Go somewhere it can’t follow.',
    'A short run before dark. Then the sofa can have you.',
    'Dusk run: the light goes soft and the day lets go.',
    'The last light is the best light. Worth catching.',
    'A loop before dinner. Nobody at the table needs to know.',
    'End the day as a dot on a map. Quiet, moving, yours.',
    'Evening air, low sun. An easy win, if you want it.',
    'Tomorrow can be loud. Tonight, a run and then nothing.',
  ],
};

/** Weekdays around 17:30, as the working day winds down. */
export const AFTERNOON_LINES = [
  'Work’s nearly done. Running home, or a loop once you’re there?',
  'The working day is winding down. The quiet part can start whenever you like.',
  'Laptop closing soon? Twenty minutes outside clears the inbox out of your head.',
  'End of the day, nearly. A short run makes a good door between work and the evening.',
  'Done talking for today? The pavement won’t ask a thing.',
  'Home soon. Shoes by the door, if you fancy it.',
];

/** Weekend notes. */
export const WEEKEND_LINES = [
  'Weekend. No plans needed. A loop counts as one.',
  'Nothing on the calendar? A run fits neatly in the gaps.',
  'Weekend mornings move slowly. Plenty of time for a loop.',
  'Saturday or Sunday, the route doesn’t mind. Neither do we.',
  'A lazy day can hold a short run. It won’t take much of it.',
];

/** Your usual days. {day} is the weekday name. */
export const RHYTHM_LINES = [
  '{day}, around now. You usually go about this time. Just mentioning it.',
  'Your hour is coming up. The route is where you left it.',
  '{day} is apparently a running day for you. The park agrees.',
  'This is roughly when you go. No pressure, just the hour.',
  'The usual {day} slot is nearly here. The shoes have noticed.',
  'In about an hour it’s your time. Nobody else has booked it.',
  'Your {day} run, if you want it. It’s been reliable company.',
  'Habit check: {day}, late enough to wake up, early enough to matter.',
];

/** Wet now, dry later. {time} is the first dry hour. */
export const WINDOW_LINES = [
  'Rain until {time}, then dry. The clouds go first. You can follow.',
  'Wet now. Dry from {time}. Most people won’t notice. You will.',
  'Dry from {time}. Puddles, but no more rain.',
  'It eases off around {time}. Fresher air, same route.',
];

/** The single line in week two, after a week of not opening the app. Then silence. */
export const LAST_LINES = [
  'That’s the last nudge for a while. The app will be here, quietly, whenever.',
  'Going quiet now. If you want the reminders back, just go for a run.',
  'Last one from me for a bit. No hard feelings. No feelings at all, technically.',
];

export const REFLECT_TITLES = ['How was that?', 'Quick one'];
export const REFLECT_LINES = ['Energy now, before the shower wins. One tap.', 'How do you feel, compared to before? Tap to note it.'];

export const AFTER_RUN_TITLES = ['Run saved.', 'Done.', 'That’s one.', 'Logged, quietly.'];

export const AFTER_RUN_LINES = [
  'Nobody saw that. Which was the plan.',
  'Energy check: probably up. Science, roughly.',
  'That’s a run. No feed, no kudos, no notes. Just yours.',
  'Shower, tea, silence. In that order.',
  'The map has a new line on it. Only you can see it.',
  'Good. Now go be unavailable for a while.',
  'Legs did the talking. Everything else can stay quiet.',
  'A run finished. Nothing else is needed from you today.',
];

/** "Fewer words": one plain fact per kind of note, no joke. {day} and {time} as above. */
export const PLAIN = {
  nudge: ['A run today, if you want one.', 'Time for a short run, if you like.'],
  morning: 'Morning. A run before the day starts?',
  evening: 'Evening. A short run before dark?',
  quiet: 'A few days since your last run. A short one, if you want.',
  gap: 'It’s been a while since your last run. Start small, whenever you like.',
  weather: 'Rain or fog in the forecast. Dress for it if you go.',
  rhythm: '{day}. You usually run around now.',
  window: 'Rain until {time}, then dry.',
  afternoon: 'Work’s nearly done. A run home, or once you’re there?',
  weekend: 'Weekend. A run fits in, if you want one.',
  last: 'That’s the last reminder for a while.',
  afterRunTitle: 'Run saved.',
  afterRun: 'It’s on this phone, nowhere else.',
  reflectTitle: 'How was that?',
  reflect: 'How do you feel now? One tap to note it.',
};

export const TITLES = ['Runtrovert', 'Hi there', 'A quiet word', 'Psst', 'Small thought', 'Just saying', 'Low-key', 'No pressure'];

const ALL_MOODS: Mood[] = ['nudge', 'rest', 'quiet', 'gap', 'weather', 'morning', 'evening'];
export const TOTAL_LINES = ALL_MOODS.reduce((n, m) => n + LINES[m].length, 0);
