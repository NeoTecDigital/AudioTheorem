"""Optional native-menu part of the workstation workflow; authoritative state assertions."""
import subprocess


async def verify(harness, ws, window):
    state = await harness.snapshot(ws)
    harness.click(window, 1200, 665)
    await harness.settle(ws, 0.5)
    harness.click(window, 1200, 582)  # output +
    changed = await harness.settle(ws, 0.5)
    assert abs(changed['controls']['gain'] - state['controls']['gain'] - 0.05) < 1e-5
    harness.click(window, 1100, 478)  # measured off
    changed = await harness.settle(ws, 0.5)
    assert not changed['view']['measured'], changed['view']
    harness.click(window, 1100, 478)
    assert (await harness.settle(ws, 0.5))['view']['measured']
    harness.click(window, 1135, 504)  # immersive
    assert (await harness.settle(ws, 0.5))['view']['immersive']
    harness.capture(window, 'native-menu-immersive')
    harness.click(window, 980, 504)  # precise
    assert not (await harness.settle(ws, 0.5))['view']['immersive']
    harness.capture(window, 'native-menu-precise')
    subprocess.run(['xdotool', 'windowsize', window, '960', '1080'], check=True)
    await harness.settle(ws, 0.6)
    harness.capture(window, 'native-menu-narrow')
    subprocess.run(['xdotool', 'windowsize', window, '1920', '1080'], check=True)
    await harness.settle(ws, 0.5)
    harness.focus(window)
    subprocess.run(['xdotool', 'key', '--window', window, 'Tab'], check=True)
