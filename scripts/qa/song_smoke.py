#!/usr/bin/env python3
"""Opt-in live X11/Vulkan/audio workflow; synthetic song, no session secrets in evidence."""
import asyncio
import io
import json
import math
import os
from pathlib import Path
import re
import struct
import subprocess
import time
import urllib.request
import wave
import websockets

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/qa-evidence/song-landscape'
LOG = Path('/tmp/song-native-private.log')


def recording():
    data = bytearray()
    for i in range(48000 * 24):
        t = i / 48000
        root = [261.6256, 293.6648, 391.9954, 261.6256][int(t / 6)]
        amplitude = 0.10 + 0.08 * math.sin(t * 2)
        left = amplitude * sum(math.sin(2 * math.pi * root * ratio * t) for ratio in [1, 1.25, 1.5])
        right = amplitude * math.sin(2 * math.pi * (root * 2 + 5 * math.sin(t)) * t)
        data.extend(struct.pack('<hh', int(left * 32767), int(right * 32767)))
    output = io.BytesIO()
    with wave.open(output, 'wb') as stream:
        stream.setnchannels(2)
        stream.setsampwidth(2)
        stream.setframerate(48000)
        stream.writeframes(data)
    return output.getvalue()


async def receive(ws, predicate):
    while True:
        value = json.loads(await asyncio.wait_for(ws.recv(), 8))
        if value.get('type') == 'error':
            raise RuntimeError(value)
        if predicate(value):
            return value


async def snapshot(ws):
    return (await receive(ws, lambda v: v.get('type') == 'snapshot'))['state']


async def settle(ws, seconds):
    until = time.monotonic() + seconds
    state = None
    while time.monotonic() < until:
        state = await snapshot(ws)
    return state


async def command(ws, number, action, **args):
    await ws.send(json.dumps(dict(id=number, action=action, **args)))
    ack = await receive(ws, lambda v: v.get('type') == 'ack' and v['ack']['id'] == number)
    assert not ack['ack'].get('error'), ack


def focus(window):
    subprocess.run(['swaymsg', f'[id={window}] focus'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['xdotool', 'windowactivate', '--sync', window], check=True)


def coordinates(window, x, y):
    geometry = subprocess.check_output(['xdotool', 'getwindowgeometry', '--shell', window], text=True)
    values = dict(line.split('=', 1) for line in geometry.splitlines())
    width, height = int(values['WIDTH']), int(values['HEIGHT'])
    logical_width = max(960, 720*width/height)
    logical_height = logical_width*height/width
    if y >= 330:
        y += logical_height-720
    return str(round(x/logical_width*width)), str(round((1-y/logical_height)*height))


def click(window, x, y):
    focus(window)
    px, py = coordinates(window, x, y)
    subprocess.run(['xdotool', 'mousemove', '--window', window, px, py, 'click', '1'], check=True)


def capture(window, name):
    focus(window)
    time.sleep(0.35)
    path = OUT / (name + '.png')
    subprocess.run(['import', '-window', window, str(path)], check=True)
    colors = int(subprocess.check_output(['identify', '-format', '%k', str(path)], text=True))
    assert colors > 32, 'Blank or occluded capture is not visual verification'


async def scrub(ws, window, fraction):
    focus(window)
    x, y = coordinates(window, 18 + fraction * (1280-36), 130)
    subprocess.run(['xdotool', 'mousemove', '--window', window, str(x), str(y), 'mousedown', '1'], check=True)
    paused = await settle(ws, 0.7)
    assert not paused['playing'], 'Drag must pause file only'
    capture(window, 'scrub-draft')
    subprocess.run(['xdotool', 'mouseup', '1'], check=True)
    state = await settle(ws, 0.7)
    assert state['playing'], 'Release must restore prior playing state'
    assert abs(state['playback_seconds']-fraction*24) < 2, {'position': state['playback_seconds'], 'expected': fraction*24}
    return state


def native_window(pid):
    for _ in range(50):
        found = subprocess.run(['xdotool', 'search', '--all', '--onlyvisible', '--pid', str(pid),
                                '--name', '^HARMONIC / Nova$'], capture_output=True, text=True)
        if found.returncode == 0 and found.stdout.strip():
            window = found.stdout.splitlines()[0]
            floated = subprocess.run(['swaymsg', f'[id={window}] floating enable, focus'], capture_output=True)
            if floated.returncode == 0:
                subprocess.run(['xdotool', 'windowsize', window, '1920', '1080',
                                'windowfocus', '--sync', window], check=True)
                return window
        time.sleep(0.1)
    raise RuntimeError('Native window did not become visible/mapped; no input injected')


async def inspect(process, base, token, content):
    async with websockets.connect(base.replace('http', 'ws')+'/ws', origin=base) as ws:
        await ws.send(json.dumps(dict(type='auth', token=token)))
        client = (await receive(ws, lambda v: v.get('type') == 'hello'))['client']
        state = await snapshot(ws)
        request = urllib.request.Request(base+'/api/import', content, method='POST', headers={
            'Authorization': 'Bearer '+token, 'X-Client-Id': str(client), 'Origin': base})
        with urllib.request.urlopen(request, timeout=15) as response:
            asset = json.load(response)['asset']
        window = native_window(process.pid)
        await settle(ws, 5)
        click(window, 145, 165)  # Fit Song: complete source before playback
        click(window, 130, 570)  # Pin C: tetrachord lens
        await settle(ws, 1)
        capture(window, 'source-before-play')
        await command(ws, 1, 'playback', playing=True)
        before = await settle(ws, 2)
        after = await scrub(ws, window, 0.60)
        assert after['asset'] == asset and after['epoch'] > before['epoch']
        focus(window)
        subprocess.run(['xdotool', 'keydown', '--window', window, 'z'], check=True)
        played = await settle(ws, 0.4)
        assert any(v['held'] and v['client'] % 32 == 0 for v in played['voices'])
        for number, immersive in enumerate([False, True], 10):
            await command(ws, number, 'view', view={**state['view'], 'immersive': immersive})
            visible = await settle(ws, 1)
            assert visible['view']['immersive'] == immersive
            capture(window, 'live-immersive' if immersive else 'live-precise')
        assert (OUT/'live-precise.png').read_bytes() != (OUT/'live-immersive.png').read_bytes(), 'Stale capture: mode switch not visible'
        await command(ws, 20, 'playback', playing=False)
        paused = await settle(ws, 0.5)
        later = await settle(ws, 1)
        assert paused['playback_frame'] == later['playback_frame']
        assert paused['sample'] < later['sample']
        focus(window)
        subprocess.run(['xdotool', 'keyup', '--window', window, 'z', 'key', '--window', window, 'Escape'], check=True)
        assert (await settle(ws, 0.4))['panic']
        report = {key: later[key] for key in ['device', 'overloads', 'epoch', 'duration_seconds', 'playback_frame']}
        report['checks'] = ['source before playback', 'native drag pause/seek/resume', 'asset identity',
                            'new output epoch', 'paused source / advancing engine', 'both modes', 'native keyboard / independent logical marks', 'native Escape panic']
        (OUT/'live-smoke.json').write_text(json.dumps(report, indent=2)+'\n')


def main():
    os.umask(0o077)
    OUT.mkdir(parents=True, exist_ok=True)
    content = recording()
    with LOG.open('w') as log:
        process = subprocess.Popen([str(ROOT/'target/release/nova-daw'), '--no-browser', '--port', '0', '--seconds', '38'],
                                   env={**os.environ, 'SDL_VIDEODRIVER': 'x11', 'NOVA_VALIDATION': '1'}, stdout=log, stderr=log)
        try:
            for _ in range(100):
                match = re.search(r'(http://127\.0\.0\.1:\d+)/#token=(\w+)', LOG.read_text())
                if match or process.poll() is not None:
                    break
                time.sleep(0.1)
            assert match, 'Initialization failed; inspect private log'
            asyncio.run(inspect(process, *match.groups(), content))
            assert process.wait(timeout=40) == 0
        finally:
            subprocess.run(['xdotool', 'mouseup', '1'], check=False)
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=10)
    sanitized = re.sub(r'#token=\w+', '#token=[REDACTED]', LOG.read_text())
    (OUT/'live-launch.log').write_text(sanitized)
    print('ALSA underrun warnings:', sanitized.count('underrun occurred'))
    print('Live song workflow passed; inspect captured views separately.')


if __name__ == '__main__':
    main()
