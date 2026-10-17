import android.os.SystemClock;
import android.view.InputDevice;
import android.view.InputEvent;
import android.view.MotionEvent;
import java.lang.reflect.Method;

// Run through adb/app_process as the shell user. Uses actual Android input events,
// including a reverse path and a second finger, rather than calling app callbacks.
public class ReaderTouch {
  static Object manager;
  static Method inject;
  static long down;
  static void event(int action, float x, float y, int fingers) throws Exception {
    MotionEvent.PointerProperties[] properties = new MotionEvent.PointerProperties[fingers];
    MotionEvent.PointerCoords[] coords = new MotionEvent.PointerCoords[fingers];
    for (int i = 0; i < fingers; i++) {
      properties[i] = new MotionEvent.PointerProperties(); properties[i].id = i;
      properties[i].toolType = MotionEvent.TOOL_TYPE_FINGER;
      coords[i] = new MotionEvent.PointerCoords(); coords[i].x = x + i * 45;
      coords[i].y = y + i * 45; coords[i].pressure = 1; coords[i].size = .05f;
    }
    MotionEvent event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, fingers,
      properties, coords, 0, 0, 1, 1, 0, 0, InputDevice.SOURCE_TOUCHSCREEN, 0);
    int injectionMode = (action & MotionEvent.ACTION_MASK) == MotionEvent.ACTION_MOVE ? 0 : 2;
    if (!((Boolean) inject.invoke(manager, event, injectionMode))) throw new IllegalStateException("Input rejected");
    event.recycle();
  }
  public static void main(String[] args) throws Exception {
    Class<?> type = Class.forName("android.hardware.input.InputManager");
    manager = type.getMethod("getInstance").invoke(null);
    inject = type.getMethod("injectInputEvent", InputEvent.class, int.class);
    String kind = args[0];
    float x = Float.parseFloat(args[1]), y = Float.parseFloat(args[2]);
    float dx = Float.parseFloat(args[3]), dy = Float.parseFloat(args[4]);
    int duration = Integer.parseInt(args[5]);
    if (kind.equals("burst")) {
      perform("swipe", x, y, dx, dy, 60);
      SystemClock.sleep(30);
      perform("swipe", x, y, dx, dy, 260);
    } else perform(kind, x, y, dx, dy, duration);
  }
  static void perform(String kind, float x, float y, float dx, float dy, int duration) throws Exception {
    down = SystemClock.uptimeMillis(); event(MotionEvent.ACTION_DOWN, x, y, 1);
    boolean multi = kind.equals("multi");
    if (multi) event(MotionEvent.ACTION_POINTER_DOWN | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), x, y, 2);
    int steps = 24;
    for (int i = 1; i <= steps; i++) {
      long remaining = down + (long) duration * i / steps - SystemClock.uptimeMillis();
      if (remaining > 0) SystemClock.sleep(remaining);
      float progress = i / (float) steps;
      if (kind.equals("reverse")) progress = progress <= .5f ? progress * 2 : (1 - progress) * 2;
      event(MotionEvent.ACTION_MOVE, x + dx * progress, y + dy * progress, multi ? 2 : 1);
    }
    if (multi) event(MotionEvent.ACTION_POINTER_UP | (1 << MotionEvent.ACTION_POINTER_INDEX_SHIFT), x + dx, y + dy, 2);
    float finalX = kind.equals("reverse") ? x : x + dx;
    float finalY = kind.equals("reverse") ? y : y + dy;
    event(kind.equals("cancel") ? MotionEvent.ACTION_CANCEL : MotionEvent.ACTION_UP, finalX, finalY, 1);
    System.out.println("INJECTED " + kind + " elapsedMs=" + (SystemClock.uptimeMillis() - down));
  }
}
