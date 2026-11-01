#!/usr/bin/env python3
"""Render the original, sample-free score «甲申未至».

Optional authoring requirements: Python 3 with numpy, and ffmpeg on PATH.
The game plays the committed MP3 and has no Python or audio-library dependency.
"""
import argparse
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import wave

import numpy as np

RATE = 44100
BPM = 54
BEAT = 60 / BPM
BARS = 16
LENGTH = round(BARS * 4 * BEAT * RATE)
RNG = np.random.default_rng(1638)


def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)


def envelope(time, duration, attack, release):
    return np.minimum(time / attack, 1) ** 1.5 * np.minimum((duration - time) / release, 1).clip(0) ** 1.4


def pluck(note, duration, intensity):
    time = np.arange(round(duration * RATE)) / RATE
    f = frequency(note)
    signal = np.zeros(len(time))
    # Slowly decaying low strings, quickly vanishing bright overtones, and a
    # tiny inharmonic component suggest wood and silk without external samples.
    for harmonic in range(1, 12):
        decay = 1.6 / (1 + harmonic * .3)
        weight = 1 / harmonic ** 1.5
        phase = 2 * np.pi * f * harmonic * (1 + harmonic * .000045) * time
        signal += weight * np.sin(phase) * np.exp(-time / decay)
    signal += .035 * RNG.normal(0, 1, len(time)) * np.exp(-time * 180)
    signal *= envelope(time, duration, .008, .18)
    return signal * intensity


def flute(note, duration, intensity):
    time = np.arange(round(duration * RATE)) / RATE
    f = frequency(note)
    vibrato = .006 * np.sin(2 * np.pi * 4.7 * time) * np.minimum(time / .7, 1)
    phase = 2 * np.pi * f * time - vibrato * f / 4.7 * np.cos(2 * np.pi * 4.7 * time)
    signal = np.sin(phase) + .13 * np.sin(2 * phase + .2) + .045 * np.sin(3 * phase)
    breath = RNG.normal(0, 1, len(time))
    breath = (breath + np.roll(breath, 1) + np.roll(breath, 2)) / 3
    signal += breath * .018
    signal *= envelope(time, duration, .24, .42)
    return signal * intensity


def strings(note, duration, intensity):
    time = np.arange(round(duration * RATE)) / RATE
    f = frequency(note)
    signal = np.zeros(len(time))
    for detune in [-.002, .0015]:
        phase = 2 * np.pi * f * (1 + detune) * time
        signal += np.sin(phase) + .12 * np.sin(2 * phase) + .07 * np.sin(3 * phase)
    signal *= .5 * envelope(time, duration, 1.1, 1.5)
    return signal * intensity


def add(track, signal, start_beat, pan):
    start = round(start_beat * BEAT * RATE) % LENGTH
    gains = np.array([math.cos((pan + 1) * math.pi / 4), math.sin((pan + 1) * math.pi / 4)])
    stereo = signal[:, None] * gains
    # Wrap tails around the period. Reverb below uses the same circular timeline.
    indices = (start + np.arange(len(signal))) % LENGTH
    track[indices] += stereo.astype(np.float32)


def render():
    track = np.zeros((LENGTH, 2), dtype=np.float32)
    # Original 16-bar theme: D minor pentatonic, with a quiet lower-register
    # opening, a higher answering phrase, and a return to D before the loop.
    melody = [
        [(0, 62, 1.7), (2, 65, .9), (3, 67, .8)],
        [(0, 69, 2.3), (2.75, 67, 1.0)],
        [(0, 65, 1.6), (2, 62, 1.5)],
        [(0, 60, 2.2), (3, 62, .9)],
        [(0, 62, 1.6), (2, 65, .8), (3, 69, .9)],
        [(0, 72, 2.1), (2.5, 69, 1.3)],
        [(0, 67, 1.7), (2.25, 65, 1.4)],
        [(0, 62, 3.5)],
        [(0, 69, 1.6), (2, 72, 1.0), (3.25, 74, .65)],
        [(0, 72, 2.4), (2.75, 69, 1)],
        [(0, 67, 1.6), (2, 69, 1.5)],
        [(0, 65, 2.4), (3, 62, .8)],
        [(0, 65, 1.6), (2, 67, .9), (3, 69, .8)],
        [(0, 67, 1.5), (2, 65, 1.6)],
        [(0, 62, 2.2), (2.75, 60, 1)],
        [(0, 62, 3.6)],
    ]
    bass = [38, 38, 34, 36, 38, 38, 36, 38, 34, 34, 36, 36, 38, 36, 38, 38]
    for bar, events in enumerate(melody):
        # Plucked answering tones retain space between phrases; no driving beat.
        root = bass[bar]
        for beat, offset, gain in [(0, 12, .15), (1.5, 19, .095), (2.5, 24, .075)]:
            add(track, pluck(root + offset, 3.5, gain), bar * 4 + beat, -.28)
        for beat, note, duration in events:
            add(track, pluck(note, duration * BEAT + .9, .24 if bar < 8 else .21), bar * 4 + beat, .17)
        if bar % 2 == 0:
            add(track, strings(root, 8.5 * BEAT, .048), bar * 4, -.1)
            add(track, strings(root + 7, 8.5 * BEAT, .026), bar * 4 + .1, .3)
    # Airy, sparse counter-voice enters only after the first statement.
    for beat, note, length in [(17, 74, 2.7), (21, 72, 2.3), (25, 69, 2.7), (29, 67, 2.5),
                              (33, 77, 2.7), (37, 74, 2.5), (41, 72, 2.5), (45, 69, 2.5),
                              (49, 72, 2.3), (53, 69, 2.5), (57, 67, 2.3), (61, 62, 2.8)]:
        add(track, flute(note, length * BEAT, .085), beat, -.18)
    # A compact diffuse room rather than an exaggerated long electronic echo.
    dry = track.copy()
    for seconds, gain in [(.071, .12), (.113, .10), (.197, .09), (.307, .075), (.419, .06),
                          (.563, .05), (.719, .04), (.887, .03), (1.109, .024), (1.373, .018)]:
        track += np.roll(dry[:, ::-1], round(seconds * RATE), axis=0) * gain
    track -= np.mean(track, axis=0)
    track *= .70 / np.max(np.abs(track))
    return track


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[1] / 'assets/audio/jiashen-wei-zhi.mp3')
    args = parser.parse_args()
    if not shutil.which('ffmpeg'):
        raise SystemExit('ffmpeg is required only to regenerate the committed soundtrack.')
    music = render()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='chongzhen-score-') as temporary:
        wav = Path(temporary) / 'score.wav'
        with wave.open(str(wav), 'wb') as stream:
            stream.setnchannels(2)
            stream.setsampwidth(2)
            stream.setframerate(RATE)
            stream.writeframes((music * 32767).astype('<i2').tobytes())
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-codec:a', 'libmp3lame', '-b:a', '160k',
                        '-metadata', 'title=甲申未至', '-metadata', 'album=崇祯工业', str(args.output)], check=True)
    stats = {'title': '甲申未至', 'method': 'Original program-composed score; synthesized instruments; no external samples',
             'bpm': BPM, 'bars': BARS, 'durationSeconds': LENGTH / RATE, 'sampleRate': RATE, 'channels': 2,
             'peakDbFS': float(20 * np.log10(np.max(np.abs(music)))),
             'rmsDbFS': float(20 * np.log10(np.sqrt(np.mean(music ** 2)))),
             'loopBoundaryStep': float(np.max(np.abs(music[0] - music[-1]))),
             'file': args.output.name, 'bytes': args.output.stat().st_size}
    args.output.with_suffix('.json').write_text(json.dumps(stats, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(stats, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
