(() => {
  const byId = (id) => document.getElementById(id);
  const fileInput = byId('file-input');
  const dropArea = byId('drop-area');
  const sourcePreview = byId('source-preview');
  const sourceEmpty = byId('source-empty');
  const inputStatus = byId('input-status');
  const textStatus = byId('text-status');
  const outputStatus = byId('output-status');
  const asciiOutput = byId('ascii-output');
  const outputEmpty = byId('output-empty');
  const loadingStatus = byId('loading-status');
  const removeButton = byId('remove-image');
  const widthRange = byId('width-range');
  const brightnessRange = byId('brightness-range');
  const contrastRange = byId('contrast-range');
  const invertCheck = byId('invert-check');
  const colorMode = byId('color-mode');
  const rampInput = byId('ramp-input');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const supportedTypes = ['image/png', 'image/jpeg', 'image/webp'];

  let imageSource = null;
  let textSource = null;
  let activeSource = null;
  let mode = 'image';
  let textArt = '';
  let activeObjectUrl = null;
  let conversionId = 0;
  let fileLoadId = 0;
  let currentText = '';

  function setStatus(node, message, isError = false) {
    node.textContent = message;
    node.classList.toggle('error', isError);
  }

  function releaseObjectUrl() {
    if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }

  function updatePreview(image) {
    sourcePreview.src = image.src;
    sourcePreview.hidden = false;
    sourceEmpty.hidden = true;
  }

  function beginFileLoad(file) {
    if (!file || !file.name) {
      setStatus(inputStatus, 'That file could not be read. Choose an image and try again.', true);
      return;
    }
    if (file.size === 0) {
      setStatus(inputStatus, 'This file is empty. Choose a different image.', true);
      return;
    }
    const extension = file.name.split('.').pop().toLowerCase();
    if (!supportedTypes.includes(file.type) && !['png', 'jpg', 'jpeg', 'webp'].includes(extension)) {
      setStatus(inputStatus, 'Unsupported file. Choose a PNG, JPG, or WebP image.', true);
      return;
    }

    const loadId = ++fileLoadId;
    const nextUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (loadId !== fileLoadId) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      if (!image.naturalWidth || !image.naturalHeight) {
        URL.revokeObjectURL(nextUrl);
        setStatus(inputStatus, 'This image has no readable pixels. Try another file.', true);
        return;
      }
      releaseObjectUrl();
      activeObjectUrl = nextUrl;
      imageSource = { drawable: image, width: image.naturalWidth, height: image.naturalHeight };
      activeSource = mode === 'image' ? imageSource : textSource;
      updatePreview(image);
      removeButton.disabled = false;
      setStatus(inputStatus, `${file.name} · ${image.naturalWidth} × ${image.naturalHeight}`);
      scheduleConversion();
    };
    image.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      if (loadId !== fileLoadId) return;
      setStatus(inputStatus, 'The image could not be opened. Try a different file.', true);
    };
    image.src = nextUrl;
  }

  function resetOutput() {
    fileLoadId++;
    conversionId++;
    imageSource = null;
    if (mode === 'image') activeSource = null;
    releaseObjectUrl();
    fileInput.value = '';
    sourcePreview.removeAttribute('src');
    sourcePreview.hidden = true;
    sourceEmpty.hidden = false;
    removeButton.disabled = true;
    asciiOutput.textContent = '';
    currentText = '';
    outputEmpty.hidden = false;
    loadingStatus.hidden = true;
    setStatus(inputStatus, 'No image selected.');
    setStatus(outputStatus, 'Choose an image to get started.');
  }

  function settings() {
    const ramp = Array.from(rampInput.value);
    return {
      width: Number(widthRange.value),
      brightness: Number(brightnessRange.value),
      contrast: Number(contrastRange.value),
      invert: invertCheck.checked,
      color: colorMode.value === 'color',
      ramp: ramp.length >= 2 ? ramp : Array.from('@%#*+=-:. '),
    };
  }

  function scheduleConversion() {
    if (mode === 'text') {
      renderTextArt();
      return;
    }
    if (!activeSource) return;
    const id = ++conversionId;
    const config = settings();
    const sourceWidth = activeSource.width;
    const sourceHeight = activeSource.height;
    // A terminal cell is taller than it is wide, so use roughly half as many rows
    // as the proportional pixel width would suggest. Limit rows to keep work bounded.
    const rows = Math.max(1, Math.min(400, Math.round(config.width * sourceHeight / sourceWidth * 0.48)));
    canvas.width = config.width;
    canvas.height = rows;
    context.clearRect(0, 0, config.width, rows);
    context.drawImage(activeSource.drawable, 0, 0, config.width, rows);
    let pixels;
    try {
      pixels = context.getImageData(0, 0, config.width, rows).data;
    } catch (error) {
      setStatus(outputStatus, 'Could not read this image. Try another file.', true);
      return;
    }

    loadingStatus.hidden = false;
    outputEmpty.hidden = true;
    setStatus(outputStatus, 'Making ASCII…');
    const monoRows = [];
    const colorRows = [];
    let y = 0;
    const contrastFactor = (259 * (config.contrast + 255)) / (255 * (259 - config.contrast));

    function processChunk() {
      if (id !== conversionId) return;
      const end = Math.min(rows, y + 24);
      for (; y < end; y++) {
        let monoLine = '';
        const lineNodes = [];
        for (let x = 0; x < config.width; x++) {
          const offset = (y * config.width + x) * 4;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const alpha = pixels[offset + 3] / 255;
          // Composite transparent pixels onto the same pale background as the output.
          const r = Math.round(red * alpha + 252 * (1 - alpha));
          const g = Math.round(green * alpha + 251 * (1 - alpha));
          const b = Math.round(blue * alpha + 247 * (1 - alpha));
          // Lift very dark foreground colors so they remain visible on the dark preview.
          const colorLight = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const lift = colorLight < 96 ? (96 - colorLight) / (255 - colorLight) : 0;
          const visibleR = Math.round(r + (255 - r) * lift);
          const visibleG = Math.round(g + (255 - g) * lift);
          const visibleB = Math.round(b + (255 - b) * lift);
          let light = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          light = Math.max(0, Math.min(255, contrastFactor * (light - 128) + 128 + config.brightness * 1.27));
          if (config.invert) light = 255 - light;
          const rampIndex = Math.round((light / 255) * (config.ramp.length - 1));
          const char = config.ramp[rampIndex];
          monoLine += char;
          if (config.color) {
            if (char === ' ') lineNodes.push(document.createTextNode(char));
            else {
              const span = document.createElement('span');
              span.className = 'ascii-color';
              span.style.color = `rgb(${visibleR} ${visibleG} ${visibleB})`;
              span.textContent = char;
              lineNodes.push(span);
            }
          }
        }
        monoRows.push(monoLine);
        colorRows.push(lineNodes);
      }
      if (y < rows) {
        window.setTimeout(processChunk, 0);
        return;
      }
      if (id !== conversionId) return;
      currentText = monoRows.join('\n');
      if (config.color) {
        const fragment = document.createDocumentFragment();
        colorRows.forEach((line, index) => {
          line.forEach((node) => fragment.appendChild(node));
          if (index < colorRows.length - 1) fragment.appendChild(document.createTextNode('\n'));
        });
        asciiOutput.replaceChildren(fragment);
      } else {
        asciiOutput.textContent = currentText;
      }
      loadingStatus.hidden = true;
      setStatus(outputStatus, `${config.width} columns · ${rows} rows`);
    }
    window.setTimeout(processChunk, 0);
  }

  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files || [];
    if (file) beginFileLoad(file);
  });
  dropArea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });
  ['dragenter', 'dragover'].forEach((name) => dropArea.addEventListener(name, (event) => {
    event.preventDefault();
    dropArea.classList.add('is-over');
  }));
  ['dragleave', 'drop'].forEach((name) => dropArea.addEventListener(name, (event) => {
    event.preventDefault();
    dropArea.classList.remove('is-over');
  }));
  dropArea.addEventListener('drop', (event) => beginFileLoad(event.dataTransfer.files[0]));
  removeButton.addEventListener('click', resetOutput);

  [[widthRange, byId('width-value')], [brightnessRange, byId('brightness-value')], [contrastRange, byId('contrast-value')]].forEach(([range, value]) => {
    range.addEventListener('input', () => {
      value.value = range.value;
      value.textContent = range.value;
      scheduleConversion();
    });
  });
  [invertCheck, colorMode, rampInput].forEach((control) => control.addEventListener('input', scheduleConversion));
  colorMode.addEventListener('change', scheduleConversion);

  byId('copy-button').addEventListener('click', async () => {
    if (!currentText) {
      setStatus(outputStatus, 'There is no ASCII output to copy yet.', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(currentText);
      setStatus(outputStatus, 'ASCII copied to clipboard.');
    } catch (error) {
      // Clipboard access can be blocked on non-secure origins; select output as a fallback.
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(asciiOutput);
      selection.removeAllRanges();
      selection.addRange(range);
      setStatus(outputStatus, 'Clipboard unavailable. Output selected; copy with Ctrl+C.', true);
    }
  });
  byId('download-button').addEventListener('click', () => {
    if (!currentText) {
      setStatus(outputStatus, 'There is no ASCII output to download yet.', true);
      return;
    }
    const url = URL.createObjectURL(new Blob([currentText], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ascii-art.txt';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus(outputStatus, 'Downloaded ascii-art.txt.');
  });

  byId('reset-button').addEventListener('click', () => {
    widthRange.value = '100';
    brightnessRange.value = '0';
    contrastRange.value = '0';
    byId('width-value').textContent = '100';
    byId('brightness-value').textContent = '0';
    byId('contrast-value').textContent = '0';
    invertCheck.checked = false;
    colorMode.value = 'mono';
    rampInput.value = '@%#*+=-:. ';
    scheduleConversion();
  });

  function clearGeneratedOutput() {
    conversionId++;
    currentText = '';
    asciiOutput.textContent = '';
    outputEmpty.hidden = false;
    loadingStatus.hidden = true;
  }

  function selectMode(nextMode) {
    mode = nextMode;
    byId('input-title').textContent = 'Image input';
    byId('text-title').textContent = 'Text input';
    byId('input-title').closest('.input-panel').hidden = mode !== 'image';
    byId('text-title').closest('.text-panel').hidden = mode !== 'text';
    document.querySelectorAll('.mode-button').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    activeSource = mode === 'image' ? imageSource : null;
    if (mode === 'text' && textArt) {
      scheduleConversion();
    } else if (activeSource) scheduleConversion();
    else {
      clearGeneratedOutput();
      setStatus(outputStatus, mode === 'image' ? 'Choose an image to get started.' : 'Enter text and generate text art.');
    }
  }

  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => selectMode(button.dataset.mode));
  });

  byId('generate-text').addEventListener('click', () => {
    const value = byId('text-input').value;
    if (!value.trim()) {
      textArt = '';
      clearGeneratedOutput();
      setStatus(textStatus, 'Type a word or message first.', true);
      setStatus(outputStatus, 'Enter text and generate text art.');
      return;
    }

    scheduleConversion();
  });

  const glyphs = {
    A:['01110','10001','10001','11111','10001','10001','10001'], B:['11110','10001','10001','11110','10001','10001','11110'],
    C:['01111','10000','10000','10000','10000','10000','01111'], D:['11110','10001','10001','10001','10001','10001','11110'],
    E:['11111','10000','10000','11110','10000','10000','11111'], F:['11111','10000','10000','11110','10000','10000','10000'],
    G:['01111','10000','10000','10111','10001','10001','01111'], H:['10001','10001','10001','11111','10001','10001','10001'],
    I:['11111','00100','00100','00100','00100','00100','11111'], J:['00111','00010','00010','00010','10010','10010','01100'],
    K:['10001','10010','10100','11000','10100','10010','10001'], L:['10000','10000','10000','10000','10000','10000','11111'],
    M:['10001','11011','10101','10101','10001','10001','10001'], N:['10001','11001','10101','10011','10001','10001','10001'],
    O:['01110','10001','10001','10001','10001','10001','01110'], P:['11110','10001','10001','11110','10000','10000','10000'],
    Q:['01110','10001','10001','10001','10101','10010','01101'], R:['11110','10001','10001','11110','10100','10010','10001'],
    S:['01111','10000','10000','01110','00001','00001','11110'], T:['11111','00100','00100','00100','00100','00100','00100'],
    U:['10001','10001','10001','10001','10001','10001','01110'], V:['10001','10001','10001','10001','10001','01010','00100'],
    W:['10001','10001','10001','10101','10101','10101','01010'], X:['10001','10001','01010','00100','01010','10001','10001'],
    Y:['10001','10001','01010','00100','00100','00100','00100'], Z:['11111','00001','00010','00100','01000','10000','11111'],
    0:['01110','10001','10011','10101','11001','10001','01110'], 1:['00100','01100','00100','00100','00100','00100','01110'],
    2:['01110','10001','00001','00010','00100','01000','11111'], 3:['11110','00001','00001','01110','00001','00001','11110'],
    4:['00010','00110','01010','10010','11111','00010','00010'], 5:['11111','10000','10000','11110','00001','00001','11110'],
    6:['01110','10000','10000','11110','10001','10001','01110'], 7:['11111','00001','00010','00100','01000','01000','01000'],
    8:['01110','10001','10001','01110','10001','10001','01110'], 9:['01110','10001','10001','01111','00001','00001','01110'],
    '.':['00000','00000','00000','00000','00000','00110','00110'], ',':['00000','00000','00000','00000','00110','00110','00100'],
    '!':['00100','00100','00100','00100','00100','00000','00100'], '?':['01110','10001','00001','00010','00100','00000','00100'],
    '-':['00000','00000','00000','11111','00000','00000','00000'], '_':['00000','00000','00000','00000','00000','00000','11111'],
    ':':['00000','00110','00110','00000','00110','00110','00000'], ';':['00000','00110','00110','00000','00110','00110','00100'],
    '+':['00000','00100','00100','11111','00100','00100','00000'], '/':['00001','00010','00010','00100','01000','01000','10000'],
    '(':['00010','00100','01000','01000','01000','00100','00010'], ')':['01000','00100','00010','00010','00010','00100','01000'],
    "'":['00100','00100','00010','00000','00000','00000','00000'], '"':['01010','01010','00100','00000','00000','00000','00000'],
    '&':['01100','10010','10100','01000','10101','10010','01101'], '#':['01010','11111','01010','01010','11111','01010','00000'],
    '?':['01110','10001','00001','00010','00100','00000','00100'],
  };

  function renderTextArt() {
    const value = byId('text-input').value;
    if (!value.trim()) {
      textArt = '';
      clearGeneratedOutput();
      setStatus(outputStatus, 'Enter text and generate text art.');
      return;
    }
    const config = settings();
    const mark = config.invert ? [...config.ramp].reverse().find((char) => char !== ' ') || '#' : config.ramp.find((char) => char !== ' ') || '#';
    const maxLettersPerLine = Math.max(1, Math.floor((config.width + 1) / 6));
    const wrapped = [];

    value.slice(0, 400).toUpperCase().split('\n').forEach((sourceLine) => {
      const words = sourceLine.trim().split(/\s+/).filter(Boolean);
      if (!words.length) { wrapped.push(''); return; }
      let line = '';
      words.forEach((word) => {
        while (word.length > maxLettersPerLine) {
          if (line) { wrapped.push(line); line = ''; }
          wrapped.push(word.slice(0, maxLettersPerLine));
          word = word.slice(maxLettersPerLine);
        }
        if (!line) line = word;
        else if ((line + ' ' + word).length <= maxLettersPerLine) line += ` ${word}`;
        else { wrapped.push(line); line = word; }
      });
      if (line) wrapped.push(line);
    });

    const artLines = [];
    wrapped.forEach((line, lineIndex) => {
      const bitmapRows = Array.from({ length: 7 }, () => '');
      for (const character of line) {
        const glyph = character === ' ' ? Array(7).fill('00000') : (glyphs[character] || glyphs['?']);
        for (let row = 0; row < 7; row++) bitmapRows[row] += `${glyph[row]}0`;
      }
      bitmapRows.forEach((bitmap) => artLines.push([...bitmap].map((pixel) => pixel === '1' ? mark : ' ').join('').trimEnd()));
      if (lineIndex < wrapped.length - 1) artLines.push('');
    });
    textArt = artLines.join('\n');
    currentText = textArt;
    if (config.color) {
      const textPalette = ['#ff927e', '#ffc16f', '#d4d978', '#7ed78d', '#6bd4c5', '#7db2f0', '#c49af1'];
      const fragment = document.createDocumentFragment();
      artLines.forEach((line, index) => {
        if (line) {
          const span = document.createElement('span');
          span.className = 'ascii-text-color';
          span.style.color = textPalette[index % textPalette.length];
          span.textContent = line;
          fragment.appendChild(span);
        }
        if (index < artLines.length - 1) fragment.appendChild(document.createTextNode('\n'));
      });
      asciiOutput.replaceChildren(fragment);
    } else {
      asciiOutput.textContent = textArt;
    }
    outputEmpty.hidden = true;
    loadingStatus.hidden = true;
    const columns = Math.max(0, ...artLines.map((line) => line.length));
    setStatus(textStatus, `Ready · ${value.length} characters`);
    setStatus(outputStatus, `${columns} columns · block lettering${config.color ? ' · color' : ''}`);
  }
})();
