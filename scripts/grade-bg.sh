#!/usr/bin/env bash
# Grade raw Pexels clips into the app's background loops (assets/bg-*.mp4 + .jpg posters).
#
#   scripts/grade-bg.sh <raw-dir> <out-dir> [name ...]
#
# Raw clips never go in git; keep them anywhere and point <raw-dir> at them.
# Every clip gets the same treatment so they read as one set:
#   - cropped to 9:16 around the runner, 900x1600, 24 fps, no audio
#   - desaturated a third, blacks lifted, highlights warmed toward cream
#   - slowed a little when the source is short, so every loop runs 6-8 s
#   - looped seamlessly: the last 1.2 s cross-fades into the first 1.2 s
#   - H.264 crf 27 capped at 700 kb/s: about 0.4-0.7 MB per loop
# Needs ffmpeg 4.3+ (xfade).
set -euo pipefail

RAW=${1:?raw dir}
OUT=${2:?out dir}
shift 2
mkdir -p "$OUT"

# name|source file|start s|x|y[|end s]   (x,y = where the runner sits, 0..1, used to place the 9:16 crop;
# end, when given, stops the loop before the runner turns to camera or walks out of frame)
CLIPS='
sunset-beach|7444958-uhd_3840_2160_30fps.mp4|0|0.62|0.5
mist-beach|8636806-uhd_2560_1440_25fps.mp4|3|0.50|0.5
snow-plain|7038131-uhd_4096_2160_25fps.mp4|1|0.55|0.5
grey-path|5114847-hd_1920_1080_30fps.mp4|0|0.50|0.5
green-hill|15627765-uhd_2560_1440_60fps.mp4|2|0.52|0.5
rock-coast|5929358-uhd_3840_2160_25fps.mp4|2|0.35|0.5
forest-path|14936182_3840_2160_30fps.mp4|0|0.55|0.5
green-tunnel|15294983-hd_1920_1080_24fps.mp4|1|0.50|0.5
dirt-road|15479756_3840_2160_60fps.mp4|0|0.48|0.5
field-pine|15479762_3840_2160_30fps.mp4|1|0.42|0.5
grey-beach|8637379-uhd_2560_1440_25fps.mp4|4|0.55|0.5
night-track|20540592-hd_1080_1920_30fps.mp4|2|0.5|0.50
seawall|13777117_2160_3840_24fps.mp4|0|0.5|0.50
winter-city|7218876-uhd_2160_3840_24fps.mp4|0|0.5|0.50
grey-city|5310959-uhd_2160_3840_25fps.mp4|2|0.5|0.50
farm-aerial|15928220_2160_3840_60fps.mp4|1|0.5|0.50
trail-bridge|5677457-uhd_3840_2160_24fps.mp4|2|0.50|0.5
rice-field|18274390-hd_1920_1080_24fps.mp4|11|0.45|0.5|16
park-trees|7062128-uhd_3840_2160_25fps.mp4|4|0.40|0.5|10.5
track-day|8533455-uhd_3840_2160_25fps.mp4|0|0.25|0.5|5
dirt-track|15928226_2160_3840_60fps.mp4|8|0.5|0.50
leafy-lane|13947025-hd_1920_1080_30fps.mp4|2|0.5|0.5
bare-woods|15508753_2160_3840_60fps.mp4|0|0.5|0.50
tree-avenue|8456972-hd_1080_1920_25fps.mp4|0|0.5|0.50
lake-side|4065467-uhd_3840_2160_30fps.mp4|0|0.55|0.5|7
glass-river|8834377-uhd_4096_2160_25fps.mp4|0|0.5|0.5
night-park|3126162-uhd_3840_2160_25fps.mp4|0|0.40|0.5|4.5
hood-path|12752370_1080_1920_60fps.mp4|0|0.5|0.50|3.5
sunny-park|7218851-uhd_2160_3840_24fps.mp4|0|0.5|0.50
river-bridge|5033913-uhd_3840_2160_30fps.mp4|3|0.45|0.5
'

FADE=1.2
LOOP=8

grade() {
  local name=$1 src=$2 start=$3 x=$4 y=$5 stop=${6:-}
  local in="$RAW/$src"
  local dur
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
  [ -n "$stop" ] && dur=$stop
  dur=$(echo "$dur - $start" | bc -l)
  # Short sources are slowed (up to 1.5x) so there's room for the loop + fade.
  local slow
  slow=$(echo "s=(9.6/$dur); if (s<1) s=1; if (s>1.5) s=1.5; s" | bc -l)
  local avail
  avail=$(echo "$dur*$slow" | bc -l)
  local L
  L=$(echo "l=$avail-$FADE-0.2; if (l>$LOOP) l=$LOOP; l" | bc -l)
  local off
  off=$(echo "$L-$FADE" | bc -l)
  local end
  end=$(echo "$L+$FADE" | bc -l)
  local look="crop='min(iw,ih*9/16)':'min(ih,iw*16/9)':'(iw-ow)*$x':'(ih-oh)*$y',scale=900:1600:flags=lanczos,fps=24,\
eq=saturation=0.62:contrast=0.92:brightness=0.02,\
colorbalance=rs=0.04:gs=0.015:bs=-0.05:rm=0.02:gm=0.01:bm=-0.03:rh=0.05:gh=0.03:bh=-0.07,\
curves=all='0/0.07 0.5/0.52 1/0.97',\
format=yuv420p"
  echo "-> $name  (src ${dur%.*}s, slow x$(printf %.2f "$slow"), loop $(printf %.1f "$L")s)"
  ffmpeg -nostdin -v error -y -ss "$start" -i "$in" -an -filter_complex "\
[0:v]setpts=$slow*PTS,$look,split[v0][v1];\
[v0]trim=start=$FADE:end=$end,setpts=PTS-STARTPTS[main];\
[v1]trim=start=0:end=$FADE,setpts=PTS-STARTPTS[head];\
[main][head]xfade=transition=fade:duration=$FADE:offset=$off[out]" \
    -map '[out]' -c:v libx264 -preset slow -crf 28 -maxrate 650k -bufsize 1300k -profile:v main -pix_fmt yuv420p -movflags +faststart "$OUT/bg-$name.mp4"
  ffmpeg -nostdin -v error -y -ss "$(echo "$L/2" | bc -l)" -i "$OUT/bg-$name.mp4" -frames:v 1 -q:v 5 "$OUT/bg-$name.jpg"
}

while IFS='|' read -r name src start x y stop; do
  [ -z "$name" ] && continue
  if [ $# -gt 0 ]; then
    case " $* " in *" $name "*) ;; *) continue ;; esac
  fi
  grade "$name" "$src" "$start" "$x" "$y" "$stop"
done <<< "$CLIPS"
