# Writing a tool

A tool is any object with some of a few optional methods. There's no base class to extend - a plain object works, and so does a class.

## The smallest tool

```js
// Draws a crosshair in the middle of the canvas
const crosshair = {
    draw(ctx, scene) {
      const { width, height } = scene.canvas;
      ctx.strokeStyle = "#888";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width / 2 - 8, height / 2);
      ctx.lineTo(width / 2 + 8, height / 2);
      ctx.moveTo(width / 2, height / 2 - 8);
      ctx.lineTo(width / 2, height / 2 + 8);
      ctx.stroke();
    },
  };

scene.use(crosshair);
```

## The tool interface

Every method is optional. Each one receives the scene as its last argument.

| Method | When it's called |
| --- | --- |
| `attach(scene)` | When the tool is added with `scene.use` |
| `detach(scene)` | When it's removed with `scene.unuse` or `scene.destroy`. Remove your own listeners here. |
| `pointerDown(e, scene)` | A button is pressed on the canvas. **Return `true` to take the drag.** |
| `pointerMove(e, scene)` | The pointer moves. During a drag, only the tool holding it is called; otherwise every tool is (for hover effects). |
| `pointerUp(e, scene)` | The drag this tool took is released |
| `pointerLeave(scene)` | The pointer left the canvas (not called during a drag) |
| `wheel(e, scene)` | Scroll over the canvas. **Return `true` to use it** (stops the page from scrolling). |
| `update(dt, scene)` | Every frame, before your own `update` (only while `scene.start` is running) |
| `draw(ctx, scene)` | Every render, after the objects are drawn |

One property is also read:

- `blockContextMenu: true` — disables the right-click menu on the canvas while the tool is added.

### Who gets the click

`pointerDown` and `wheel` go to tools from the **last added to the first**. The first tool that returns `true` stops the search. If your tool returns `false` (or nothing), the click falls through to the tools below it.

## Event objects

### Pointer events

Received by `pointerDown`, `pointerMove` and `pointerUp`. Mouse, pen and touch all produce them.

| Field | Meaning |
| --- | --- |
| `x`, `y` | Pointer position in **canvas pixels**, even if the canvas is scaled with CSS |
| `dx`, `dy` | Movement since the last event, in canvas pixels (0 on `pointerDown`) |
| `button` | Button that changed: 0 left, 1 middle, 2 right |
| `shiftKey`, `ctrlKey`, `altKey` | Modifier keys |
| `original` | The DOM `PointerEvent` |

### Wheel events

| Field | Meaning |
| --- | --- |
| `x`, `y` | Pointer position in canvas pixels |
| `deltaY` | Scroll amount (> 0 scrolls down) |
| `original` | The DOM `WheelEvent` |

## Example: click to select

This tool selects the clicked object and draws a dashed box around it. It returns `false` from `pointerDown`, so the click still reaches `OrbitCamera` below it and you can select and orbit in one gesture. The [helpers](./api#helpers) `pick` and `screenBounds` do the hard part.

<Demo src="select" hint="Click a shape to select it · drag to orbit · Delete key removes it" />

<<< @/demos/select.js

## Tips

- **Clean up in `detach`.** Anything you add to `window` or `document` in `attach` should be removed there. The scene already handles canvas listeners for you.
- **Use `dt` in `update`** so movement doesn't depend on frame rate.
- **Restore canvas state in `draw`** with `ctx.save()` / `ctx.restore()` if you change things like line dashes or transforms.
- **Make following the cursor exact** with [`worldPerPixel`](./api#worldperpixel), plus `cameraRight` / `cameraUp` to turn pixel movement into world movement — that's how `DragObject` works.
- **Keyboard tools** should ignore keys while the user types in an input (check `e.target.tagName`), like `FlyCamera` does.
