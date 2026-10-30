#!/usr/bin/env bash
# Widescreen versions of the background loops for the website (site/media/wide-*.mp4).
# Same look as scripts/grade-bg.sh, but 16:9 at 1920x1080 for desktop screens; phones
# keep the 9:16 app loops. Sources are the original Pexels clips (Pexels licence).
#
#   scripts/grade-bg-wide.sh <raw-dir> <out-dir>
set -euo pipefail

RAW=${1:?raw dir}
OUT=${2:?out dir}
mkdir -p "$OUT"

# name|source file|start s|x|y[|end s]
CLIPS='
sunset-beach|7444958-uhd_3840_2160_30fps.mp4|0|0.5|0.5
green-tunnel|15294983-hd_1920_1080_24fps.mp4|1|0.5|0.5
track-day|8533455-uhd_3840_2160_25fps.mp4|0|0.5|0.5|5
park-trees|7062128-uhd_3840_2160_25fps.mp4|4|0.5|0.5|10.5
mist-beach|8636806-uhd_2560_1440_25fps.mp4|3|0.5|0.5
rock-coast|5929358-uhd_3840_2160_25fps.mp4|2|0.5|0.5
snow-plain|7038131-uhd_4096_2160_25fps.mp4|1|0.5|0.5
trail-bridge|5677457-uhd_3840_2160_24fps.mp4|2|0.5|0.5
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
  local slow L off end
  slow=$(echo "s=(9.6/$dur); if (s<1) s=1; if (s>1.5) s=1.5; s" | bc -l)
  L=$(echo "l=$dur*$slow-$FADE-0.2; if (l>$LOOP) l=$LOOP; l" | bc -l)
  off=$(echo "$L-$FADE" | bc -l)
  end=$(echo "$L+$FADE" | bc -l)
  local look="crop='min(iw,ih*16/9)':'min(ih,iw*9/16)':'(iw-ow)*$x':'(ih-oh)*$y',scale=1920:1080:flags=lanczos,fps=24,\
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
    -map '[out]' -c:v libx264 -preset slow -crf 24 -maxrate 2600k -bufsize 5200k -profile:v high -pix_fmt yuv420p -movflags +faststart "$OUT/wide-$name.mp4"
  ffmpeg -nostdin -v error -y -ss "$(echo "$L/2" | bc -l)" -i "$OUT/wide-$name.mp4" -frames:v 1 -q:v 4 "$OUT/wide-$name.jpg"
}

echo "$CLIPS" | while IFS='|' read -r name src start x y stop; do
  [ -z "$name" ] && continue
  grade "$name" "$src" "$start" "$x" "$y" "$stop"
done
