// Things nobody tells you. Tips, facts and the odd useless detail for people
// who are new to running, in the app's voice: dry, kind, on your side.
// Anything medical carries a short source so it can be checked. Pure data and
// pure functions, no React Native imports, so it runs under plain Node.

export type TipTopic = 'start' | 'chafe' | 'shoes' | 'gear' | 'pace' | 'fuel' | 'weather' | 'body' | 'head' | 'trivia';

/** When a tip is most worth showing. A tip with no context fits any day. */
export type TipContext = 'first' | 'early' | 'rain' | 'cold' | 'hot' | 'wind' | 'dark' | 'gap' | 'long' | 'ranToday';

export interface Tip {
  id: string;
  topic: TipTopic;
  text: string;
  source?: string;
  when?: TipContext[];
}

export const TOPICS: Array<{ key: TipTopic; title: string }> = [
  { key: 'start', title: 'The first few runs' },
  { key: 'chafe', title: 'Chafing, frankly' },
  { key: 'shoes', title: 'Shoes' },
  { key: 'gear', title: 'What to wear' },
  { key: 'pace', title: 'Pace and breathing' },
  { key: 'fuel', title: 'Water, food, toilets' },
  { key: 'weather', title: 'Weather' },
  { key: 'body', title: 'Aches, pains, and when to stop' },
  { key: 'head', title: 'The quiet part' },
  { key: 'trivia', title: 'Useless but true' },
];

export const TIPS: Tip[] = [
  // The first few runs
  { id: 'start-walk', topic: 'start', when: ['first', 'early'], text: 'Run-walk is not cheating. It is how a great many people finish their first 5K, and plenty of marathons too.' },
  { id: 'start-ten', topic: 'start', when: ['first', 'early'], text: 'The first ten minutes feel worst for almost everyone while the body switches on. Judge the run after that, not before.' },
  { id: 'start-slow', topic: 'start', when: ['first', 'early'], text: 'Start slower than feels necessary. Going out too fast is the classic beginner mistake, and nobody hands out medals for minute three.' },
  { id: 'start-turn', topic: 'start', when: ['first'], text: 'You can turn around whenever you like. A run that ends early is still a run, and arguably a well-managed one.' },
  { id: 'start-runner', topic: 'start', when: ['first'], text: 'You are a runner from the first one. There is no minimum distance and no membership card.' },
  { id: 'start-rest', topic: 'start', when: ['early', 'ranToday'], text: 'Rest days are when you actually get fitter. The run is the request, recovery is the delivery.' },
  { id: 'start-same', topic: 'start', when: ['early'], text: 'For the first few weeks, add time before speed. Same easy pace, a few more minutes.' },
  { id: 'start-bad', topic: 'start', text: 'Some runs feel heavy for no reason. That is normal and tells you very little. The next one usually feels fine.' },

  // Chafing
  { id: 'chafe-nipple', topic: 'chafe', when: ['first', 'early', 'long'], text: 'A wet cotton shirt can rub your nipples raw after about 5 km. Wear a synthetic or merino top, and add tape or balm for longer runs.', source: 'Jogger’s nipple: Levit, NEJM 1977; Mailler & Adams, Br J Sports Med 2004' },
  { id: 'chafe-term', topic: 'chafe', text: '“Jogger’s nipple” has been a medical term since 1977. A plaster costs less than the dignity.', source: 'Levit, N Engl J Med 1977' },
  { id: 'chafe-thigh', topic: 'chafe', when: ['long', 'hot'], text: 'Thighs that touch will raise the matter around km 4. Anti-chafe balm or short tights end the discussion.' },
  { id: 'chafe-seams', topic: 'chafe', when: ['long'], text: 'Chafe starts at seams, labels, waistbands and the edge of a sports bra. Balm goes on before the run. After is just called regret.' },
  { id: 'chafe-salt', topic: 'chafe', when: ['hot', 'long'], text: 'Dried sweat leaves salt on the skin, which works like very fine sandpaper. On hot or long runs, rinse off soon after.' },
  { id: 'chafe-shower', topic: 'chafe', when: ['ranToday'], text: 'If something stings in the shower, that is where you chafed. Make a note. That spot gets balm next time.' },
  { id: 'chafe-wet', topic: 'chafe', when: ['rain'], text: 'Rain makes chafing worse, because wet fabric drags. Snugger clothes and a little balm help more than a heavier jacket.' },

  // Shoes
  { id: 'shoes-comfort', topic: 'shoes', when: ['first', 'early'], text: 'Pick running shoes by how they feel in the shop, not by colour or a gait scan. Comfort is the best guide researchers have found.', source: 'Nigg et al., Br J Sports Med 2015' },
  { id: 'shoes-pronation', topic: 'shoes', text: 'Being told you “overpronate” is not a reason to panic. In a study of 927 new runners in neutral shoes, pronators were not injured more.', source: 'Nielsen et al., Br J Sports Med 2014' },
  { id: 'shoes-thumb', topic: 'shoes', text: 'Leave about a thumb’s width between your longest toe and the end of the shoe. Feet swell and slide forward downhill.' },
  { id: 'shoes-afternoon', topic: 'shoes', text: 'Try shoes on in the afternoon, with your running socks. Feet are a little bigger later in the day, as they are on a run.' },
  { id: 'shoes-toe', topic: 'shoes', text: 'For many people the longest toe is the second one. Size for that toe, not the big one.' },
  { id: 'shoes-rotate', topic: 'shoes', text: 'Runners who alternated between more than one pair had a 39% lower injury risk in one study of 264 runners. A second pair is also a dry pair.', source: 'Malisoux et al., Scand J Med Sci Sports 2015' },
  { id: 'shoes-new', topic: 'shoes', text: 'New shoes get a few short runs first. Not the long run. Never the race.' },
  { id: 'shoes-lock', topic: 'shoes', text: 'That extra eyelet at the top of the shoe has a job. A heel-lock lace there stops your heel slipping and saves toenails.' },
  { id: 'shoes-toenail', topic: 'shoes', when: ['long'], text: 'A black toenail usually means shoes a touch too small or downhills taken too fast. Try half a size up.' },
  { id: 'shoes-km', topic: 'shoes', text: 'Shoes have no expiry date. Around 500 to 800 km, or when they start to feel flat, is a common time to swap. The evidence is thin, your legs are a better judge.' },
  { id: 'shoes-price', topic: 'shoes', text: 'Expensive is not safer. Spend on fit. Carbon-plated race shoes make fast runners faster, and easy Tuesday loops mostly more expensive.' },
  { id: 'shoes-dry', topic: 'shoes', when: ['rain'], text: 'Wet shoes: pull out the insoles, stuff them with newspaper, keep them away from the radiator. Heat melts the glue.' },

  // What to wear
  { id: 'gear-ten', topic: 'gear', when: ['cold', 'first'], text: 'Dress as if it were 5 to 10 °C warmer. You will be cold for five minutes and right for the rest. Warm at the door means overdressed.' },
  { id: 'gear-socks', topic: 'gear', when: ['first', 'early', 'rain'], text: 'Cotton socks hold water and make blisters. Synthetic or merino running socks are the cheapest upgrade in running.' },
  { id: 'gear-nothing-new', topic: 'gear', text: 'Nothing new on race day. Not shoes, not shorts, not the breakfast someone online swears by.' },
  { id: 'gear-bra', topic: 'gear', when: ['first'], text: 'A well-fitted sports bra matters more than any shirt. Unsupported breasts move several centimetres with every stride, and that is felt.', source: 'Research Group in Breast Health, University of Portsmouth' },
  { id: 'gear-pocket', topic: 'gear', text: 'Shorts with a zip pocket mean no bag, no belt and no faff. Keys, card, done.' },
  { id: 'gear-cap', topic: 'gear', when: ['rain', 'hot'], text: 'A cap keeps rain off your glasses and sun off your face. The most useful running gear nobody photographs.' },
  { id: 'gear-gloves', topic: 'gear', when: ['cold'], text: 'Gloves before a hat. Fingers go cold first and come back last.' },
  { id: 'gear-reflect', topic: 'gear', when: ['dark'], text: 'Reflective bits on your ankles and wrists are seen sooner than on your chest, because drivers recognise moving limbs as a person.', source: 'Biomotion studies: Wood, Tyrrell et al.' },
  { id: 'gear-layers', topic: 'gear', when: ['cold', 'wind'], text: 'Two thin layers beat one thick one. You can take one off and tie it round your waist like it is 1994.' },

  // Pace and breathing
  { id: 'pace-talk', topic: 'pace', when: ['first', 'early'], text: 'Most runs should be easy enough to talk in full sentences. You will not be talking to anyone. But you could.', source: 'Talk test: Persinger et al., Med Sci Sports Exerc 2004' },
  { id: 'pace-easy', topic: 'pace', text: 'Your easy pace can be a minute or more per km slower than your fastest 5K pace. That is not lazy, that is how it is done.' },
  { id: 'pace-hill', topic: 'pace', text: 'Uphill: shorter steps, same effort, let the pace drop. The hill does not know your average.' },
  { id: 'pace-cadence', topic: 'pace', text: 'There is no magic 180 steps a minute. But if you overstride, steps about 5 to 10% quicker and shorter take load off the knees and hips.', source: 'Heiderscheit et al., Med Sci Sports Exerc 2011' },
  { id: 'pace-wind', topic: 'pace', when: ['wind'], text: 'Windy day: run out into the wind and home with it behind you. Tired you will be grateful.' },
  { id: 'pace-breath', topic: 'pace', text: 'There is no correct breathing pattern. Mouth, nose, both. If you cannot finish a sentence, you are no longer running easy.' },
  { id: 'pace-gps', topic: 'pace', text: 'GPS pace wobbles under trees and between tall buildings. Your effort does not. Trust the one in your chest.' },
  { id: 'pace-negative', topic: 'pace', text: 'Finishing a little faster than you started is called a negative split. It feels smug in the best way.' },

  // Water, food, toilets
  { id: 'fuel-short', topic: 'fuel', when: ['first', 'early'], text: 'For runs under an hour, most people need nothing on the go. A drink before and after, and thirst is a fine guide.', source: 'ACSM fluid replacement position stand, 2007' },
  { id: 'fuel-over', topic: 'fuel', when: ['long', 'hot'], text: 'Drinking far beyond thirst on long runs can dilute your blood’s sodium, which is dangerous. Drink to thirst, not to a schedule.', source: 'Hyponatraemia consensus: Hew-Butler et al., Clin J Sport Med 2015' },
  { id: 'fuel-pee', topic: 'fuel', text: 'Pale straw is the colour you want. Perfectly clear means you can ease off the water a bit.' },
  { id: 'fuel-before', topic: 'fuel', when: ['first'], text: 'Eat something plain one to three hours before. Running on a full stomach is a lesson people only need once.' },
  { id: 'fuel-carbs', topic: 'fuel', when: ['long'], text: 'Beyond about an hour to ninety minutes, carbs on the go help: roughly 30 to 60 g an hour, which is a gel or a banana or two.', source: 'Thomas, Erdman & Burke, Med Sci Sports Exerc 2016' },
  { id: 'fuel-coffee', topic: 'fuel', text: 'Coffee before a run makes it feel easier for many people. It also works on the gut. Know where the toilets are.', source: 'ISSN caffeine position stand, 2021' },
  { id: 'fuel-trots', topic: 'fuel', when: ['long'], text: 'Runner’s gut trouble is common: a third or more of distance runners get it. Less fibre the night before, and a route that passes a toilet.', source: 'de Oliveira et al., Sports Med 2014' },
  { id: 'fuel-after', topic: 'fuel', when: ['ranToday'], text: 'After a run, a normal meal with some protein is all the recovery nutrition most people need. No powder required.' },

  // Weather
  { id: 'weather-rain', topic: 'weather', when: ['rain'], text: 'Rain empties the park. Cap on, no cotton, and you get the whole place to yourself. Skin is waterproof.' },
  { id: 'weather-lungs', topic: 'weather', when: ['cold'], text: 'Cold air will not freeze your lungs; it warms up on the way in. It can make airways sting, so a buff over the mouth helps.' },
  { id: 'weather-heat', topic: 'weather', when: ['hot'], text: 'In heat, run by effort and slow down. Heart rate climbs at the same pace when it is warm. Go early, while the pavement is still cool.' },
  { id: 'weather-heatill', topic: 'weather', when: ['hot'], text: 'In the heat, confusion, stumbling or a sudden headache are not tiredness. Stop, get into shade, cool down with water and get help.', source: 'ACSM heat illness consensus, Roberts et al. 2023' },
  { id: 'weather-ice', topic: 'weather', when: ['cold'], text: 'On ice: short steps, aim for the snow rather than the shine, and accept that today is a walk with ambition.' },
  { id: 'weather-facing', topic: 'weather', when: ['dark'], text: 'Where there is no pavement, run facing the traffic so you see what is coming. Something that blinks helps too.', source: 'UK Highway Code, rule 2' },
  { id: 'weather-windchill', topic: 'weather', when: ['wind', 'cold'], text: 'Wind counts. 5 °C with a strong wind can feel close to zero, especially on the way back when you are sweaty.' },
  { id: 'weather-sun', topic: 'weather', when: ['hot'], text: 'Sunscreen on the ears and the back of the neck. Marathon runners showed more sun damage on the skin than non-runners in one study.', source: 'Ambros-Rudolph et al., Arch Dermatol 2006' },
  { id: 'weather-dark', topic: 'weather', when: ['dark'], text: 'Dark runs are quieter but uneven. Pick a route you know, with lights, and save the trail for the weekend.' },

  // Aches and pains
  { id: 'body-pain', topic: 'body', text: 'A mild ache that eases as you warm up is usually fine. Pain that gets worse, changes how you run, or is above 3 out of 10 means stop and rest a couple of days.', source: 'Pain-monitoring model: Silbernagel et al., Am J Sports Med 2007' },
  { id: 'body-toomuch', topic: 'body', when: ['early'], text: 'Most running injuries come from doing too much too soon, not from shoes or form. Patience is the best injury prevention there is.', source: 'Nielsen et al., J Orthop Sports Phys Ther 2012' },
  { id: 'body-longest', topic: 'body', when: ['long', 'early'], text: 'A single run much longer than your longest of the past month raised injury risk in a study of over 5,000 runners. Grow it by about 10%.', source: 'Frandsen et al., Br J Sports Med 2025' },
  { id: 'body-shin', topic: 'body', when: ['early'], text: 'Shin splints mostly mean too much, too soon. Ease off. A sharp pain on one spot of the bone is different: stop and get it checked.' },
  { id: 'body-stretch', topic: 'body', text: 'Static stretching before a run does not prevent injuries. Five minutes of very easy jogging warms you up better.', source: 'Lauersen et al., Br J Sports Med 2014' },
  { id: 'body-strength', topic: 'body', text: 'Strength training cut sports injuries to about a third in a large review. Squats, lunges and calf raises at home count.', source: 'Lauersen et al., Br J Sports Med 2014' },
  { id: 'body-stitch', topic: 'body', text: 'Side stitch: slow down, breathe out deeply, press on the spot. Nobody fully knows why they happen, which is oddly comforting.', source: 'Morton & Callister, Sports Med 2015' },
  { id: 'body-doms', topic: 'body', when: ['ranToday', 'gap'], text: 'Sore legs a day or two later after something new is normal. It peaks at around one to three days, then goes.', source: 'Cheung et al., Sports Med 2003' },
  { id: 'body-cramp', topic: 'body', when: ['long'], text: 'Cramp seems to be more about tired muscles than missing salt. Slow down, stretch gently, walk it off.', source: 'Schwellnus, Br J Sports Med 2009' },
  { id: 'body-blister', topic: 'body', text: 'Leave blisters unpopped if you can, and cover them. Friction plus moisture makes them, so dry socks prevent most.' },
  { id: 'body-chest', topic: 'body', text: 'Chest pain, feeling faint, or a heartbeat that feels wrong: stop and get checked. That is never a toughness test.' },
  { id: 'body-sleep', topic: 'body', text: 'Sleep is training. Young athletes sleeping under eight hours were injured more often in one study.', source: 'Milewski et al., J Pediatr Orthop 2014' },
  { id: 'body-gap', topic: 'body', when: ['gap'], text: 'Back after a break? Start shorter and easier than you were. Fitness returns faster than it first arrived.' },

  // The quiet part
  { id: 'head-spotlight', topic: 'head', when: ['first', 'early'], text: 'Nobody is watching you as much as you think. Students made to wear an embarrassing T-shirt guessed half the room noticed. About a quarter did.', source: 'Spotlight effect: Gilovich et al., J Pers Soc Psychol 2000' },
  { id: 'head-nod', topic: 'head', text: 'You do not need to greet every runner. A small nod is a complete sentence.' },
  { id: 'head-green', topic: 'head', text: 'Moving among trees or by water lifts mood, and in one large analysis the biggest gain came in the first five minutes.', source: 'Barton & Pretty, Environ Sci Technol 2010' },
  { id: 'head-high', topic: 'head', text: 'The runner’s high is probably more endocannabinoids than endorphins. Your body makes its own calm, at least in mice, and probably in you.', source: 'Fuss et al., PNAS 2015' },
  { id: 'head-ears', topic: 'head', when: ['dark'], text: 'Near traffic, keep one ear free, or none. The quiet is part of the run anyway.' },
  { id: 'head-hours', topic: 'head', text: 'Quiet hours: early mornings, rainy evenings, Sunday canal paths, and the industrial estate at the weekend. Nobody runs there. That is the point.' },
  { id: 'head-thoughts', topic: 'head', text: 'Thinking is allowed. So is not thinking. Both are valid things to do for thirty minutes.' },
  { id: 'head-verdict', topic: 'head', when: ['ranToday'], text: 'A slow run is data, not a verdict. Most runs are just fine, and fine is the goal.' },
  { id: 'head-short', topic: 'head', text: 'Even 5 to 10 minutes of running a day was linked to a lower risk of early death in a study of 55,000 adults. Short counts.', source: 'Lee et al., J Am Coll Cardiol 2014' },
  { id: 'head-alone', topic: 'head', text: 'Running clubs are lovely. Not wanting one is also lovely. Nobody ever needed permission to run alone.' },

  // Useless but true
  { id: 'trivia-steps', topic: 'trivia', text: 'At a gentle pace you take roughly 1,000 steps per kilometre. Your feet are very good at not complaining about this.' },
  { id: 'trivia-force', topic: 'trivia', text: 'Each landing puts about two to three times your body weight through your leg. Bodies are, frankly, impressive.' },
  { id: 'trivia-sweat', topic: 'trivia', text: 'Humans are one of very few animals built to run long distances in the heat, mostly thanks to sweating. Embarrassing, but effective.', source: 'Bramble & Lieberman, Nature 2004' },
  { id: 'trivia-pheidippides', topic: 'trivia', text: 'Pheidippides, who in legend ran the first marathon, died at the finish. History’s original argument for tapering.' },
  { id: 'trivia-42', topic: 'trivia', text: 'The marathon became 42.195 km at the 1908 London Olympics, so the route could start at Windsor Castle and end in front of the royal box.' },
  { id: 'trivia-police', topic: 'trivia', text: 'In the late 1960s some American joggers were stopped by police, who could not think why anyone would run without being chased.' },
  { id: 'trivia-switzer', topic: 'trivia', text: 'Kathrine Switzer ran Boston in 1967, when women were not officially allowed. An official tried to drag her off the course. She finished.' },
  { id: 'trivia-oldest', topic: 'trivia', text: 'Fauja Singh took up running at 89 and finished a marathon at 100. So the “too late to start” argument is, respectfully, weak.' },
];

export interface TipContextInput {
  runCount: number;
  daysSinceLast: number | null; // null if never run
  lastRunKm: number | null;
  tempC?: number | null;
  feelsC?: number | null;
  windKmh?: number | null;
  wet?: boolean; // rain, drizzle, storm, snow now or soon
  dark?: boolean;
}

/** What the day looks like, as tip contexts. */
export function contextsFor(c: TipContextInput): Set<TipContext> {
  const s = new Set<TipContext>();
  if (c.runCount === 0) s.add('first');
  else if (c.runCount < 6) s.add('early');
  if (c.daysSinceLast != null && c.daysSinceLast >= 10) s.add('gap');
  if (c.daysSinceLast === 0) s.add('ranToday');
  if (c.lastRunKm != null && c.lastRunKm >= 8) s.add('long');
  const feels = c.feelsC ?? c.tempC;
  if (feels != null && feels <= 5) s.add('cold');
  if (c.tempC != null && c.tempC >= 24) s.add('hot');
  if (c.windKmh != null && c.windKmh >= 25) s.add('wind');
  if (c.wet) s.add('rain');
  if (c.dark) s.add('dark');
  return s;
}

function hash(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * One tip for today. Prefers tips that fit the day, skips ones already shown
 * until everything has had a turn, and stays the same all day for the same
 * context so the screen doesn't shuffle each time it opens.
 */
export function pickTip(ctx: Set<TipContext>, seen: string[], day: string, tips: Tip[] = TIPS): Tip {
  const seenSet = new Set(seen);
  let pool = tips.filter((t) => !seenSet.has(t.id));
  if (!pool.length) pool = tips;
  const fitting = pool.filter((t) => t.when?.some((w) => ctx.has(w)));
  // Beginners and weather get the fitting tip; otherwise fitting ones are just more likely.
  const strong = ctx.has('first') || ctx.has('rain') || ctx.has('hot') || ctx.has('cold') || ctx.has('dark');
  const general = pool.filter((t) => !t.when && !(t.topic === 'start' || t.id === 'gear-bra'));
  let from: Tip[];
  if (fitting.length && (strong || hash(day + 'mix') % 3 !== 0)) from = fitting;
  else from = general.length ? general : pool;
  const key = [...ctx].sort().join(',');
  return from[hash(day + '|' + key) % from.length];
}

export function tipsByTopic(tips: Tip[] = TIPS): Array<{ key: TipTopic; title: string; tips: Tip[] }> {
  return TOPICS.map((t) => ({ ...t, tips: tips.filter((x) => x.topic === t.key) })).filter((t) => t.tips.length);
}
