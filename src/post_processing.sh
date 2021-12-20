#!/bin/sh
# ffmpeg -i video.mp4 -filter:v "setpts=1.16*PTS" -y speedup.mp4
# ffmpeg -i test.webm -i speedup.mp4 -shortest -y merged.mp4
# ffmpeg -i merged.mp4 -filter_complex "[0:v]setpts=0.87*PTS[v];[0:a]atempo=1.15[a]" -map "[v]" -map "[a]" -y merged-speedup.mp4

OUTPUT_FILE=${1::-9}recording.mp4
ffmpeg -i "${1}" -filter:v "setpts=1.16*PTS" -y "${1}-speedup.mp4"
ffmpeg -i "${2}" -i "${1}-speedup.mp4" -shortest -y automerged.mp4
ffmpeg -i automerged.mp4 -filter_complex "[0:v]setpts=0.88*PTS[v];[0:a]atempo=1.15[a]" -map "[v]" -map "[a]" -y "${OUTPUT_FILE}"
rm automerged.mp4 "${1}-speedup.mp4"
