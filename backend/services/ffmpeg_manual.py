import ffmpeg

    #  Basic format
ffmpeg.input('test1.mp4').output('output_test1.mp4').run()

#   Trim a video
ffmpeg.input('test1.mp4',ss=0,t=0.2 ).output('output_test2.mp4').run()


    # Changing the resolution
ffmpeg.input("test1.mp4").output('output_test3.mp4',vf='scale=440:280',an=None).run()


    #  Speedup or slow down of the video

ffmpeg.input("test1.mp4").output("fast.mp4",vf="setpts=0.2*PTS").run()

ffmpeg.input("test1.mp4").output("slow.mp4",vf="setpts=2.0*PTS").run()


#  Add the rotate
ffmpeg.input("test1.mp4").output("output5.mp4",vf="transpose=1 ").run() 


# Merge multiple clip
videos=["output_test2.mp4","output5.mp4"] 
with open("file_list.txt","w") as f:
    for video in videos:
        f.write(f"file '{video}'\n")   

ffmpeg.input('file_list.txt',format='concat', safe=0).output("merged.mp4",c="copy").run()


#   Cropped video


ffmpeg.input("test1.mp4").output("cropped.mp4",vf="crop=320:240:0:0 ").run() 


# Editing the audio


# Change volume (0.5 = half, 2.0 = double)
ffmpeg.input("test1.mp4").output("vol.mp4", af="volume=0.5", vcodec="copy").run()



# Remove audio completely (you already used this: an=None)
ffmpeg.input("test1.mp4").output("mute.mp4", an=None).run()

# Extract audio only
ffmpeg.input("test1.mp4").output("audio.mp3", vn=None).run()

# Fade in and 
# fade out (fade out starts at 8s, video is 10s long)
ffmpeg.input("test1.mp4").output("fade.mp4", af="afade=t=in:d=2,afade=t=out:st=8:d=2", vcodec="copy").run()


# Trim audio (seconds 5 to 15)
ffmpeg.input("test1.mp4").output("trim.mp3", af="atrim=5:15,asetpts=PTS-STARTPTS", vn=None).run()


# Speed up / slow down audio (pitch stays the same)
ffmpeg.input("test1.mp4").output("fast_audio.mp4", af="atempo=2.0", vcodec="copy").run()
ffmpeg.input("test1.mp4").output("slow_audio.mp4", af="atempo=0.5", vcodec="copy").run()


# Normalize loudness
ffmpeg.input("test1.mp4").output("norm.mp4", af="loudnorm=I=-16:TP=-1.5:LRA=11", vcodec="copy").run()


# Remove background noise

ffmpeg.input("test1.mp4").output("clean.mp4", af="afftdn=nr=12", vcodec="copy").run()

# Cut rumble (high-pass) and hiss (low-pass)
ffmpeg.input("test1.mp4").output("eq.mp4", af="highpass=f=80,lowpass=f=8000", vcodec="copy").run()


# Echo
ffmpeg.input("test1.mp4").output("echo.mp4", af="aecho=0.8:0.9:300:0.4", vcodec="copy").run()

# Reverse audio

ffmpeg.input("test1.mp4").output("rev.mp3", af="areverse", vn=None).run()


# Convert to mono
ffmpeg.input("test1.mp4").output("mono.mp4", ac=1, vcodec="copy").run()