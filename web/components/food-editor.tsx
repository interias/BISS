"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  ApiError,
  createFood,
  getFood,
  imageUrl,
  updateFood,
  uploadFoodImage,
  validateFood,
  type Atwater,
  type FoodDetail,
  type FoodWrite,
  type LabelExtraction,
  type LabelViolation,
  type Per100,
  type Serving,
} from "@/lib/api";
import {
  isInvalid,
  NUTRIENTS,
  parseInput,
  per100OfLabel,
  readNutrients,
  servingsOfLabel,
  shownOrigin,
  skippedNote,
  toInput,
  type NutrientKey,
} from "@/lib/editor";
import { fmt, ORIGIN_LABELS, per100Unit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FoodPic } from "@/components/food-pic";
import { SheetTitle } from "@/components/sheet";

const CHECK_DEBOUNCE_MS = 300;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // the API's limit, checked early for a clear message

/** The rules of the backend's label check (SPEC 7); its details are for the log. */
const VIOLATIONS: Record<LabelViolation["rule"], string> = {
  atwater: "Die kcal passen nicht zu den Makros.",
  energy: "kJ und kcal passen nicht zusammen.",
  sugar: "Zucker liegt über den Kohlenhydraten.",
  saturated_fat: "Gesättigte Fettsäuren liegen über dem Fett.",
};

type Actions = {
  /** The food as the backend saved it, with the new photo when one was chosen. */
  onSaved: (food: FoodDetail) => void;
  onCancel: () => void;
};

type New = {
  /** The scanned code of a barcode without a hit; the new food is stored with it. */
  gtin?: string;
  /** The draft read from the label photo; it fills the new food. */
  label?: LabelExtraction;
};

/**
 * Editor sheet; with a food id it loads the food and edits it, without one it creates.
 */
export function FoodEditor({ foodId, gtin, label, ...actions }: Actions & New & { foodId?: number }) {
  const [food, setFood] = useState<FoodDetail | null>(null);
  useEffect(() => {
    if (foodId === undefined) return;
    let live = true;
    getFood(foodId).then((detail) => live && setFood(detail), console.error);
    return () => {
      live = false;
    };
  }, [foodId]);

  if (foodId !== undefined && !food) {
    return <SheetTitle className="sr-only">Lebensmittel bearbeiten</SheetTitle>;
  }
  return <EditorForm food={food ?? undefined} gtin={gtin} label={label} {...actions} />;
}

type Row = { key: number; label: string; grams: string };

/** Existing servings keep their id as key, new ones get negative keys. */
const rowsOf = (servings: Serving[]): Row[] =>
  servings.map((s) => ({ key: s.id, label: s.label, grams: toInput(s.grams) }));
const defaultKeyOf = (servings: Serving[]) => servings.find((s) => s.is_default)?.id ?? null;
const textsOf = (per100?: Per100) =>
  Object.fromEntries(
    NUTRIENTS.map(({ key }) => [key, toInput(per100?.[key] ?? null)]),
  ) as Record<NutrientKey, string>;

const inputClass =
  "h-[42px] w-full min-w-0 rounded-[10px] border bg-surface-2 px-3 text-foreground";

/**
 * Photo, name, brand, nutrition table per 100 g with the live Atwater hint, and the serving
 * list (star = standard, origin tag). Validation and the change of origin are the backend's
 * (ADR-0003); the `eigene` tag while typing is a preview.
 */
export function EditorForm({ food, gtin, label, onSaved, onCancel }: Actions & New & { food?: FoodDetail }) {
  const draft = food ? undefined : label?.draft;
  // The label servings as read; the row of the i-th has the key -(i + 1).
  const [fromLabel] = useState(() => (draft ? servingsOfLabel(draft) : { servings: [], skipped: [] }));
  // The last saved state: after a save whose photo upload failed, a retry must update.
  const [base, setBase] = useState(food);
  const [name, setName] = useState(food?.name ?? draft?.name ?? "");
  const [brand, setBrand] = useState(food?.brand ?? draft?.brand ?? "");
  const [texts, setTexts] = useState(() => textsOf(food?.per_100 ?? (draft && per100OfLabel(draft.per_100))));
  // Servings from the label are new rows (negative keys).
  const [rows, setRows] = useState(() =>
    food
      ? rowsOf(food.servings)
      : fromLabel.servings.map((s, i) => ({ key: -(i + 1), label: s.label, grams: toInput(s.grams) })),
  );
  const [star, setStar] = useState(() => defaultKeyOf(food?.servings ?? []));
  const [added, setAdded] = useState<number | null>(null);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [atwater, setAtwater] = useState<Atwater | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextKey = useRef(-(fromLabel.servings.length + 1));
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);

  const nutrients = readNutrients(texts);
  const starred = rows.some((r) => r.key === star) ? star : (rows[0]?.key ?? null);
  const kept = rows.filter((r) => r.label.trim()); // a blank row is dropped on save
  const gramsOk = kept.every((r) => {
    const grams = parseInput(r.grams);
    return grams !== null && Number.isFinite(grams) && grams > 0;
  });
  const canSave = !busy && name.trim() !== "" && nutrients !== null && gramsOk;
  const basis = base?.basis ?? draft?.per_100.basis ?? "g";
  /** The label serving a row started from, while the food is not created yet. */
  const readOf = (key: number) => (base || key > 0 ? undefined : fromLabel.servings[-key - 1]);
  /** The serving a row started from: a saved one or one read from the label. */
  const originalOf = (key: number) => (base ? base.servings.find((s) => s.id === key) : readOf(key));
  const skipped = base ? null : skippedNote(fromLabel.skipped);

  // Atwater hint: the backend computes it, debounced like the search (ADR-0003).
  const checkBody =
    nutrients &&
    JSON.stringify({
      kcal: nutrients.kcal,
      protein: nutrients.protein,
      carbs: nutrients.carbs,
      fat: nutrients.fat,
      fiber: nutrients.fiber,
    });
  useEffect(() => {
    if (!checkBody) return;
    let live = true;
    const timer = setTimeout(() => {
      validateFood(JSON.parse(checkBody)).then((r) => live && setAtwater(r.atwater), console.error);
    }, CHECK_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [checkBody]);

  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // the same file can be chosen again
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) return setError("Das Foto ist größer als 10 MB.");
    setError(null);
    setPhoto({ file, url: URL.createObjectURL(file) });
  };

  const setRow = (key: number, change: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const addRow = () => {
    const key = nextKey.current--;
    setRows((list) => [...list, { key, label: "", grams: "100" }]);
    setAdded(key);
  };
  const removeRow = (key: number) => setRows((list) => list.filter((r) => r.key !== key));

  const submit = async () => {
    if (!canSave || !nutrients) return;
    const body: FoodWrite = {
      name: name.trim(),
      brand: brand.trim() || null,
      // Only when it creates: the backend normalises the GTIN and refuses a taken one.
      ...(!base && draft && { basis }),
      ...(!base && gtin && { gtin }),
      per_100: nutrients,
      servings: kept.map((r) => {
        const read = readOf(r.key);
        return {
          ...(r.key > 0 && { id: r.key }),
          label: r.label.trim(),
          grams: parseInput(r.grams) as number,
          is_default: r.key === starred,
          // The backend keeps the origin while label and grams are as read (ADR-0003).
          ...(read && { origin: read.origin, as_read: { label: read.label, grams: read.grams } }),
        };
      }),
    };
    setBusy(true);
    setError(null);
    let saved: FoodDetail;
    try {
      saved = base ? await updateFood(base.id, body) : await createFood(body);
    } catch (failure) {
      console.error(failure);
      setError(
        failure instanceof ApiError && failure.status === 409
          ? "Diese GTIN gehört schon zu einem anderen Lebensmittel."
          : "Speichern fehlgeschlagen.",
      );
      setBusy(false);
      return;
    }
    if (photo) {
      try {
        saved = await uploadFoodImage(saved.id, photo.file);
      } catch (failure) {
        console.error(failure);
        // Saved without the photo: later tries update this food, so no duplicate arises.
        setBase(saved);
        setRows(rowsOf(saved.servings));
        setStar(defaultKeyOf(saved.servings));
        setError("Gespeichert, aber das Foto ging nicht (JPEG, PNG oder WebP bis 10 MB).");
        setBusy(false);
        return;
      }
    }
    onSaved(saved);
  };

  const photoSrc = photo?.url ?? (base?.image_path ? imageUrl(base.image_path) : null);
  const unit = per100Unit(basis);

  return (
    <>
      <SheetTitle className="mb-2 text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">
        {food ? "Lebensmittel bearbeiten" : draft ? "Neu · aus Etikett gelesen" : "Neues Lebensmittel"}
      </SheetTitle>

      <div className="mb-1.5 grid grid-cols-[auto_1fr] items-start gap-3.5">
        <div className="grid justify-items-center gap-1.5">
          <button
            type="button"
            aria-label="Produktfoto aufnehmen oder wählen"
            onClick={() => gallery.current?.click()}
            className="relative"
          >
            <FoodPic size={96} src={photoSrc} />
            <span className="absolute bottom-1.5 left-1.5 grid size-[26px] place-items-center rounded-[9px] bg-card text-foreground shadow-[0_2px_6px_var(--biss-shadow)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.6" />
              </svg>
            </span>
          </button>
          <div className="flex gap-2.5 text-[11.5px] font-bold text-muted-foreground">
            <button type="button" onClick={() => camera.current?.click()}>
              Kamera
            </button>
            <button type="button" onClick={() => gallery.current?.click()}>
              Galerie
            </button>
          </div>
          <input ref={gallery} type="file" accept="image/*" hidden data-testid="photo-gallery" onChange={pick} />
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden data-testid="photo-camera" onChange={pick} />
        </div>
        <div className="min-w-0">
          <div className="mb-2.5 grid min-w-0 gap-1">
            <label htmlFor="food-name" className="text-xs font-bold text-muted-foreground">
              Name
            </label>
            <input id="food-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </div>
          <div className="mb-2.5 grid min-w-0 gap-1">
            <label htmlFor="food-brand" className="text-xs font-bold text-muted-foreground">
              Marke
            </label>
            <input id="food-brand" value={brand} onChange={(e) => setBrand(e.target.value)} className={inputClass} />
          </div>
          {gtin && (
            // Read only: the scanned code, stored with the new food.
            <div className="mb-2.5 grid min-w-0 gap-1">
              <label htmlFor="food-gtin" className="text-xs font-bold text-muted-foreground">
                GTIN
              </label>
              <input id="food-gtin" value={gtin} readOnly className={cn(inputClass, "tabular-nums text-muted-foreground")} />
            </div>
          )}
        </div>
      </div>

      {draft && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl border bg-surface-2 px-2.5 py-2 text-[12.5px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-[34px] flex-none rounded-lg border bg-[repeating-linear-gradient(0deg,var(--biss-surface)_0_5px,var(--biss-line)_5px_6px)]"
          />
          <span>
            <b className="text-foreground">Etikett-Foto</b> wird nur zum Auslesen genutzt und nicht gespeichert. Das
            Produktfoto links ist separat.
          </span>
        </div>
      )}
      {label && !food && !label.validation.ok && (
        // The backend's check after the second try (SPEC 7); the live hint below stays.
        <div
          data-testid="label-warning"
          className="mb-3 flex items-start gap-2 rounded-xl border border-warn bg-surface-2 px-3 py-2.5 text-[13px]"
        >
          <b className="text-warn">!</b>
          <div>
            <p className="font-semibold">Die gelesenen Werte sind unplausibel. Bitte mit dem Etikett vergleichen.</p>
            <ul className="mt-1 list-disc pl-4">
              {label.validation.violations.map((v) => (
                <li key={v.rule}>{VIOLATIONS[v.rule]}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div role="group" aria-label="Nährwerte" className="mt-1 mb-3 rounded-xl border-2 border-foreground px-3 pt-2.5 pb-1">
        <div className="mb-1 flex justify-between border-b-4 border-foreground pb-1.5 text-[13px] font-extrabold">
          <span>Nährwerte</span>
          <span>je {unit}</span>
        </div>
        {NUTRIENTS.map(({ key, label, required }) => (
          <div key={key} className="flex items-center justify-between border-b py-[3px] last:border-b-0">
            <label htmlFor={`n-${key}`} className="text-[13.5px]">
              {label}
            </label>
            <input
              id={`n-${key}`}
              inputMode="decimal"
              value={texts[key]}
              placeholder={required ? "0" : "–"}
              aria-invalid={isInvalid(texts[key])}
              onChange={(e) => setTexts((t) => ({ ...t, [key]: e.target.value }))}
              className="h-8 w-[84px] rounded-lg border border-transparent bg-transparent px-1.5 text-right font-bold tabular-nums hover:border-border hover:bg-surface-2 focus:border-border focus:bg-surface-2 aria-invalid:border-warn"
            />
          </div>
        ))}
      </div>

      <AtwaterHint result={nutrients ? atwater : null} kcal={nutrients?.kcal ?? 0} invalid={!nutrients} />

      <div className="mt-1 mb-1.5 flex items-baseline justify-between">
        <h3 className="text-[11px] font-bold tracking-[.12em] text-muted-foreground uppercase">Portionen</h3>
        <span className="text-xs text-muted-foreground">Stern = Standard für Zuletzt-Chips</span>
      </div>
      <ul aria-label="Portionen">
        {rows.length === 0 && (
          <li className="py-2 text-[13px] text-muted-foreground">
            Keine Portionen. Ohne Portion wird in Gramm eingetragen.
          </li>
        )}
        {rows.map((row) => {
          const origin = shownOrigin(originalOf(row.key), row.label.trim(), parseInput(row.grams));
          return (
            <li
              key={row.key}
              className="grid grid-cols-[28px_1fr_78px_auto_28px] items-center gap-2 border-b border-dashed py-1.5"
            >
              <button
                type="button"
                aria-label="Als Standard setzen"
                aria-pressed={row.key === starred}
                onClick={() => setStar(row.key)}
                className={cn(
                  "grid size-7 place-items-center rounded-full border-[1.5px] text-transparent",
                  row.key === starred && "border-primary bg-primary text-primary-foreground",
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
                </svg>
              </button>
              <input
                value={row.label}
                placeholder="z. B. 1 Scheibe"
                aria-label="Bezeichnung"
                autoFocus={row.key === added}
                onChange={(e) => setRow(row.key, { label: e.target.value })}
                className="h-9 w-full min-w-0 rounded-[9px] border bg-surface-2 px-[9px]"
              />
              <input
                value={row.grams}
                inputMode="decimal"
                aria-label="Gramm"
                onChange={(e) => setRow(row.key, { grams: e.target.value })}
                className="h-9 w-full min-w-0 rounded-[9px] border bg-surface-2 px-[9px] text-right font-bold tabular-nums"
              />
              <span
                data-testid="origin"
                className={cn(
                  "rounded-md border px-1.5 py-[3px] text-[10.5px] font-bold whitespace-nowrap text-muted-foreground",
                  origin === "package" && "border-ok text-ok",
                  origin === "own" && "border-primary text-primary",
                )}
              >
                {ORIGIN_LABELS[origin]}
              </span>
              <button
                type="button"
                aria-label="Portion entfernen"
                onClick={() => removeRow(row.key)}
                className="size-7 rounded-[9px] text-muted-foreground"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      {skipped && (
        <p data-testid="label-skipped" className="mt-1.5 text-xs text-muted-foreground">
          {skipped}
        </p>
      )}
      <button
        type="button"
        onClick={addRow}
        className="mt-2 mb-4 h-[42px] w-full rounded-xl border-[1.5px] border-dashed font-bold text-primary"
      >
        + Portion hinzufügen
      </button>

      {error && (
        <p role="alert" className="mb-3 text-[13px] font-semibold text-warn">
          {error}
        </p>
      )}
      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className="h-[54px] rounded-2xl border px-[18px] font-semibold text-muted-foreground"
        >
          {draft ? "Verwerfen" : "Abbrechen"}
        </button>
        <button
          type="button"
          disabled={!canSave}
          onClick={submit}
          className="h-[54px] flex-1 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-45"
        >
          {food ? "Speichern" : "Speichern & eintragen"}
        </button>
      </div>
    </>
  );
}

/** The Atwater hint of the backend: values within 10 % of the stated kcal are plausible. */
function AtwaterHint({ result, kcal, invalid }: { result: Atwater | null; kcal: number; invalid: boolean }) {
  const bad = invalid || (result !== null && !result.ok);
  let text = "Prüfe Werte …";
  if (invalid) text = "Bitte nur Zahlen ab 0 eingeben.";
  else if (result) {
    const deviation =
      result.deviation_pct === null ? "nicht berechenbar" : `${fmt(result.deviation_pct, 1)} % Abweichung`;
    text =
      `${result.ok ? "Plausibel" : "Unplausibel"}: aus Makros ${fmt(result.computed_kcal)} kcal, ` +
      `angegeben ${fmt(kcal)} kcal (${deviation}).${result.ok ? "" : " Bitte Werte prüfen."}`;
  }
  return (
    <div
      data-testid="atwater"
      aria-live="polite"
      className="mb-4 flex items-start gap-2 rounded-xl border bg-surface-2 px-3 py-2.5 text-[13px]"
    >
      <b className={bad ? "text-warn" : "text-ok"}>{bad ? "!" : result ? "✓" : "…"}</b>
      <span className="tabular-nums">{text}</span>
    </div>
  );
}
