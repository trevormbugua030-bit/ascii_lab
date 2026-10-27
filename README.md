# ascii lab

A small image and text-to-ASCII converter that runs entirely in your browser. It uses plain HTML, CSS, JavaScript, and the Canvas API. Images and text are not uploaded anywhere.

## Run it

No install or build step is needed. From this directory, start a local server:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000> in a browser. On Omarchy Linux, open a terminal in the project folder, run the command above, then press `Super` and open Firefox (or your preferred browser) and visit that address. Stop the server with `Ctrl+C`.

You can also open `index.html` directly, though clipboard access may require the local server in some browsers.

## Use

- Choose a PNG, JPG, or WebP image, or drag one into the input area.
- Switch to **Text generator**, enter a word or short message, and choose **Generate text art**. Block lettering wraps to the selected width and keeps line breaks.
- Adjust width, brightness, contrast, inversion, color mode, or the character ramp. The preview updates as you work. Image color mode keeps sampled colors visible on the dark preview; text color mode uses the lab's muted green.
- Copy the plain ASCII text or download it as `ascii-art.txt`.
- Use **Remove** to clear the current image, or **Reset settings** to restore the default conversion settings.

Conversion happens locally in the browser. The output uses a character-cell aspect correction and limits its rendered height to keep processing responsive.
