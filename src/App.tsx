import { useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function PdfViewer({ file }: { file: File }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("Загрузка PDF…");
  const [width, setWidth] = useState(800);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let task: ReturnType<typeof pdfjs.getDocument> | undefined;
    void file
      .arrayBuffer()
      .then(async (data) => {
        if (disposed) return;
        task = pdfjs.getDocument({ data });
        const document = await task.promise;
        if (!disposed) setPdf(document);
      })
      .catch((error: unknown) => {
        if (!disposed)
          setStatus(
            error instanceof Error && error.name === "PasswordException"
              ? "PDF защищён паролем. Выберите копию без пароля."
              : "Не удалось открыть PDF. Возможно, файл повреждён.",
          );
      });
    return () => {
      disposed = true;
      void task?.destroy();
    };
  }, [file]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      // contentRect already excludes the frame's padding.
      const nextWidth = Math.max(1, Math.floor(entry.contentRect.width));
      setWidth((previous) => (previous === nextWidth ? previous : nextWidth));
    });
    observer.observe(frame.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    const container = frame.current!;
    const canvases: HTMLCanvasElement[] = [];
    void (async () => {
      for (let page = 1; page <= pdf.numPages; page++) {
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;
        setStatus(`Загрузка страниц: ${page} из ${pdf.numPages}…`);
        const canvas = document.createElement("canvas");
        canvases.push(canvas);
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", `Страница ${page}`);
        const base = pdfPage.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const scale = Math.min(width / base.width, 1.5) * zoom;
        const viewport = pdfPage.getViewport({ scale: scale * ratio });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.style.width = `${viewport.width / ratio}px`;
        canvas.style.height = `${viewport.height / ratio}px`;
        task = pdfPage.render({ canvas, viewport });
        await task.promise;
        if (cancelled) return;
        container.appendChild(canvas);
        pdfPage.cleanup();
      }
      setStatus("");
    })().catch(() => {
      if (!cancelled) setStatus("Не удалось отобразить все страницы.");
    });
    return () => {
      cancelled = true;
      task?.cancel();
      for (const canvas of canvases) {
        canvas.remove();
        canvas.width = 0;
        canvas.height = 0;
      }
    };
  }, [pdf, zoom, width]);

  return (
    <>
      <nav className="toolbar" aria-label="Управление просмотром">
        <div className="controls">
          <span>Всего страниц: {pdf?.numPages ?? "…"}</span>
        </div>
        <div className="controls">
          <button
            disabled={zoom <= 0.5}
            onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
            aria-label="Уменьшить"
          >
            −
          </button>
          <button onClick={() => setZoom(1)} title="По ширине">
            {Math.round(zoom * 100)}%
          </button>
          <button
            disabled={zoom >= 3}
            onClick={() => setZoom(Math.min(3, zoom + 0.25))}
            aria-label="Увеличить"
          >
            +
          </button>
        </div>
      </nav>
      <div className="status" role="status">
        {status}
      </div>
      <div className="document" ref={frame} aria-label="Документ PDF" />
    </>
  );
}

export default function App() {
  const [selection, setSelection] = useState<{ file: File; id: number } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [loadingDefault, setLoadingDefault] = useState(true);
  const defaultRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    defaultRequest.current = controller;

    void (async () => {
      try {
        // Vite serves public files from the application root, without /public.
        const response = await fetch(
          `${import.meta.env.BASE_URL}sample10.pdf`,
          {
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const signature = await blob.slice(0, 5).text();
        if (signature !== "%PDF-") throw new Error("Invalid PDF");
        if (controller.signal.aborted) return;
        const file = new File([blob], "Договор.pdf", {
          type: "application/pdf",
        });
        setSelection((previous) => previous ?? { file, id: 1 });
      } catch {
        if (!controller.signal.aborted) {
          setError("Не удалось загрузить sample10.pdf. Выберите PDF вручную.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingDefault(false);
      }
    })();

    return () => controller.abort();
  }, []);

  function openFile(file?: File) {
    if (!file) return;
    if (
      !file.name.toLowerCase().endsWith(".pdf") &&
      file.type !== "application/pdf"
    ) {
      setError("Выберите файл в формате PDF.");
      return;
    }
    defaultRequest.current?.abort();
    setLoadingDefault(false);
    setError("");
    setSelection((previous) => ({ file, id: (previous?.id ?? 0) + 1 }));
  }

  return (
    <main
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        openFile(event.dataTransfer.files[0]);
      }}
    >
      <header>
        <div className="heading">
          <h1>Просмотр PDF</h1>
          <p title={selection?.file.name}>
            {selection?.file.name ?? "Откройте документ для просмотра"}
          </p>
        </div>
        <label className="open-button">
          Открыть PDF
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(event) => {
              openFile(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </header>
      {selection && (
        <section className="contract-info" aria-labelledby="contract-title">
          <div className="contract-heading">
            <h2 id="contract-title">Информация о договоре</h2>
            <span className="demo-badge">Демо-данные</span>
          </div>
          <dl className="contract-details">
            <div>
              <dt>Номер договора</dt>
              <dd>ДГ-2026/042</dd>
            </div>
            <div>
              <dt>Дата договора</dt>
              <dd>
                <time dateTime="2026-11-10">10 ноября 2026</time>
              </dd>
            </div>
            <div>
              <dt>Заказчик</dt>
              <dd>
                Иванов Иван Иванович<span>ООО «Пример»</span>
              </dd>
            </div>
            <div>
              <dt>Исполнитель</dt>
              <dd>
                Петров Пётр Петрович<span>ООО «Образец»</span>
              </dd>
            </div>
          </dl>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {selection ? (
        <PdfViewer key={selection.id} file={selection.file} />
      ) : loadingDefault ? (
        <p className="status" role="status">
          Загрузка договора…
        </p>
      ) : (
        <section className="empty">
          <div className="file-icon" aria-hidden="true">
            PDF
          </div>
          <h2>Ваш PDF — здесь</h2>
          <p>Перетащите файл на страницу или нажмите «Открыть PDF».</p>
          <small>Файл остаётся на вашем устройстве.</small>
        </section>
      )}
    </main>
  );
}
