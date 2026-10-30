"""Targeted synthetic X11 pointer events; never warp/clamp across compositor outputs."""
from Xlib import X, display
from Xlib.protocol import event


class Pointer:
    def __init__(self):
        self.position = None

    def move(self, window, x, y):
        self.position = (int(window), int(x), int(y))

    def button(self, down):
        if self.position is None:
            return
        window, x, y = self.position
        connection = display.Display()
        target = connection.create_resource_object('window', window)
        cls = event.ButtonPress if down else event.ButtonRelease
        message = cls(time=X.CurrentTime, root=connection.screen().root, window=target, child=X.NONE,
                      root_x=0, root_y=0, event_x=x, event_y=y, state=0 if down else X.Button1Mask,
                      detail=1, same_screen=1)
        target.send_event(message, event_mask=X.ButtonPressMask if down else X.ButtonReleaseMask)
        connection.sync()
        connection.close()
        if not down:
            self.position = None
