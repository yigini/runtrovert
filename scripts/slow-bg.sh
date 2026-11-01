#!/usr/bin/env bash
# Slow a finished app loop (assets/bg-NAME.mp4) by FACTOR with motion-interpolated
# in-between frames, then re-cut a seamless 8 s loop (1.2 s crossfade) so file size stays the same.
# Usage: scripts/slow-bg.sh FACTOR NAME [NAME...]   (reads from git HEAD copy in ORIG_DIR, default assets)
set -euo pipefail
F=$1; shift
IN=${ORIG_DIR:-assets}; OUT=${OUT_DIR:-assets}
LOOP=8; XF=1.2
NEED=$(awk -v l=$LOOP -v x=$XF -v f=$F 'BEGIN{printf "%.3f",(l+x)/f+0.2}')
for n in "$@"; do
  src="$IN/bg-$n.mp4"; tmp=$(mktemp -d)
  ffmpeg -v error -y -t "$NEED" -i "$src" -vf "setpts=$F*PTS,minterpolate=fps=24:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1" \
    -an -c:v libx264 -crf 14 -preset fast -pix_fmt yuv420p "$tmp/slow.mp4"
  ffmpeg -v error -y -i "$tmp/slow.mp4" -filter_complex \
    "[0:v]split=2[x][y];[x]trim=$XF:$(awk -v l=$LOOP -v x=$XF 'BEGIN{print l+x}'),setpts=PTS-STARTPTS[m];[y]trim=0:$XF,setpts=PTS-STARTPTS[h];[m][h]xfade=transition=fade:duration=$XF:offset=$(awk -v l=$LOOP -v x=$XF 'BEGIN{print l-x}'),format=yuv420p[v]" \
    -map "[v]" -an -c:v libx264 -crf 23 -maxrate 1600k -bufsize 3200k -preset slow -profile:v high -tune film -movflags +faststart "$OUT/bg-$n.mp4"
  ffmpeg -v error -y -i "$OUT/bg-$n.mp4" -frames:v 1 -q:v 3 "$OUT/bg-$n.jpg" 2>/dev/null || true
  rm -rf "$tmp"; echo "slowed $n x$F"
done
