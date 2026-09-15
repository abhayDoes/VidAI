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

