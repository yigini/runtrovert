#!/usr/bin/env bash
# Grade raw Pexels clips into the background loops.
#
#   scripts/grade-bg.sh tall <raw-dir> <out-dir> [name ...]   -> bg-<name>.mp4/.jpg   (app, 900x1600)
#   scripts/grade-bg.sh wide <raw-dir> <out-dir> [name ...]   -> wide-<name>.mp4/.jpg (site, 1920x1080)
#
# Raw clips never go in git; keep them anywhere and point <raw-dir> at them.
# One cinematic look for every clip so they read as one film:
#   - cropped around the subject, 24 fps, no audio
#   - real slow motion from 50+ fps sources (2x, 120 fps sources 2.5x)
#   - gentle S-curve with true blacks, cool shadows, warm highlights,
#     slightly muted colour, soft vignette
#   - looped seamlessly: the last 1.2 s cross-fades into the first 1.2 s
# Needs ffmpeg 4.3+ (xfade).
set -euo pipefail

MODE=${1:?tall or wide}
RAW=${2:?raw dir}
OUT=${3:?out dir}
shift 3
mkdir -p "$OUT"

# name|source file|start s|x|y|end s|slow|site
#  x,y   where the subject sits (0..1), used to place the crop
#  end   optional: stop before the shot goes wrong
#  slow  optional: playback factor; empty = automatic (above)
#  site  w = also cut a widescreen version for runtrovert.app
CLIPS='
sunset-beach|7444958-uhd_3840_2160_30fps.mp4|0|0.62|0.5|||w
mist-beach|8636806-uhd_2560_1440_25fps.mp4|3|0.50|0.5|||
snow-plain|7038131-uhd_4096_2160_25fps.mp4|1|0.55|0.5|||w
grey-path|5114847-hd_1920_1080_30fps.mp4|0|0.50|0.5|||
rock-coast|5929358-uhd_3840_2160_25fps.mp4|2|0.35|0.5|||w
green-tunnel|15294983-hd_1920_1080_24fps.mp4|1|0.50|0.5|||
dirt-road|15479756_3840_2160_60fps.mp4|0|0.48|0.5|||
grey-beach|8637379-uhd_2560_1440_25fps.mp4|4|0.55|0.5|||
winter-city|7218876-uhd_2160_3840_24fps.mp4|0|0.5|0.50|||
trail-bridge|5677457-uhd_3840_2160_24fps.mp4|2|0.50|0.5|||
rice-field|18274390-hd_1920_1080_24fps.mp4|11|0.45|0.5|16||
park-trees|7062128-uhd_3840_2160_25fps.mp4|4|0.40|0.5|10.5||
track-day|8533455-uhd_3840_2160_25fps.mp4|0|0.25|0.5|5||
dirt-track|15928226_2160_3840_60fps.mp4|8|0.5|0.50|||
leafy-lane|13947025-hd_1920_1080_30fps.mp4|2|0.5|0.5|||
bare-woods|15508753_2160_3840_60fps.mp4|0|0.5|0.50|||
tree-avenue|8456972-hd_1080_1920_25fps.mp4|0|0.5|0.50|||
lake-side|4065467-uhd_3840_2160_30fps.mp4|0|0.55|0.5|7||
glass-river|8834377-uhd_4096_2160_25fps.mp4|0|0.5|0.5|||
night-park|3126162-uhd_3840_2160_25fps.mp4|0|0.40|0.5|4.5||
sunny-park|7218851-uhd_2160_3840_24fps.mp4|0|0.5|0.50|||w
river-bridge|5033913-uhd_3840_2160_30fps.mp4|3|0.45|0.5|||w
sunset-water|7733300-hd_1920_1080_25fps.mp4|1|0.5|0.5|13||w
cobbles|3209242-uhd_3840_2160_25fps.mp4|0|0.5|0.5|||
blade-stride|6022795-uhd_3840_2160_25fps.mp4|6.2|0.5|0.5|||w
sun-trees|853771-hd_1920_1080_30fps.mp4|0|0.68|0.5|||w
sea-road|16686655_1080_1920_120fps.mp4|0|0.5|0.5|4.2||
dark-forest|13494091_2160_3840_25fps.mp4|2|0.5|0.5|||
'

FADE=1.2
LOOP=8

if [ "$MODE" = wide ]; then
  AR_W=16; AR_H=9; SIZE=1920:1080; PREFIX=wide; ENC='-crf 24 -maxrate 2600k -bufsize 5200k -profile:v high'
else
  AR_W=9; AR_H=16; SIZE=900:1600; PREFIX=bg; ENC='-crf 28 -maxrate 700k -bufsize 1400k -profile:v main'
fi

grade() {
  local name=$1 src=$2 start=$3 x=$4 y=$5 stop=${6:-} slow=${7:-}
  local in="$RAW/$src"
  local dur fps
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  fps=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "$in" | bc -l)
  [ -n "$stop" ] && dur=$stop
  dur=$(echo "$dur - $start" | bc -l)
  if [ -z "$slow" ]; then
    if [ "$(echo "$fps >= 100" | bc)" = 1 ]; then slow=2.5
    elif [ "$(echo "$fps >= 48" | bc)" = 1 ]; then slow=2
    else slow=$(echo "s=(9.6/$dur); if (s<1) s=1; if (s>1.5) s=1.5; s" | bc -l); fi
  fi
  local L off end
  L=$(echo "l=$dur*$slow-$FADE-0.2; if (l>$LOOP) l=$LOOP; l" | bc -l)
  off=$(echo "$L-$FADE" | bc -l)
  end=$(echo "$L+$FADE" | bc -l)
  local look="crop='min(iw,ih*$AR_W/$AR_H)':'min(ih,iw*$AR_H/$AR_W)':'(iw-ow)*$x':'(ih-oh)*$y',scale=$SIZE:flags=lanczos,fps=24,\
eq=contrast=1.10:saturation=0.86:brightness=-0.012,\
colorbalance=rs=-0.035:gs=-0.005:bs=0.035:rh=0.045:gh=0.015:bh=-0.045,\
curves=all='0/0.025 0.25/0.205 0.5/0.49 0.75/0.785 1/0.965',\
vignette=angle=PI/4.6,\
format=yuv420p"
  echo "-> $PREFIX-$name  (src ${dur%.*}s @ ${fps%.*} fps, slow x$(printf %.2f "$slow"), loop $(printf %.1f "$L")s)"
  # shellcheck disable=SC2086
  ffmpeg -nostdin -v error -y -ss "$start" -i "$in" -an -filter_complex "\
[0:v]setpts=$slow*PTS,$look,split[v0][v1];\
[v0]trim=start=$FADE:end=$end,setpts=PTS-STARTPTS[main];\
[v1]trim=start=0:end=$FADE,setpts=PTS-STARTPTS[head];\
[main][head]xfade=transition=fade:duration=$FADE:offset=$off[out]" \
    -map '[out]' -c:v libx264 -preset slow $ENC -pix_fmt yuv420p -movflags +faststart "$OUT/$PREFIX-$name.mp4"
  ffmpeg -nostdin -v error -y -ss "$(echo "$L/2" | bc -l)" -i "$OUT/$PREFIX-$name.mp4" -frames:v 1 -q:v 5 "$OUT/$PREFIX-$name.jpg"
}

while IFS='|' read -r name src start x y stop slow site; do
  [ -z "$name" ] && continue
  if [ $# -gt 0 ]; then
    case " $* " in *" $name "*) ;; *) continue ;; esac
  elif [ "$MODE" = wide ] && [ "$site" != w ]; then
    continue
  fi
  grade "$name" "$src" "$start" "$x" "$y" "$stop" "$slow"
done <<< "$CLIPS"
