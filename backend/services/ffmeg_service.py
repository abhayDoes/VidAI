import ffmpeg


def trim_video(input_path, output_path, start, duration):

    (
        ffmpeg
        .input(input_path, ss=start, t=duration)
        .output(output_path)
        .run()
    )

    return output_path


def resize_video(input_path, output_path, width, height):

    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=f"scale={width}:{height}"
        )
        .run()
    )

    return output_path


def crop_video(input_path, output_path, width, height, x=0, y=0):

    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=f"crop={width}:{height}:{x}:{y}"
        )
        .run()
    )

    return output_path


def rotate_video(input_path, output_path):

    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf="transpose=1"
        )
        .run()
    )

    return output_path


def change_speed(input_path, output_path, speed):

    (
        ffmpeg
        .input(input_path)
        .output(
            output_path,
            vf=f"setpts={1/speed}*PTS"
        )
        .run()
    )

    return output_path