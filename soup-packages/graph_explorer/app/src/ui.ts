import { h } from "@soup/sdk";

export interface Choice {
  name: string;
  note?: string;
  color?: string;
}
export type Option = string | [value: string, label: string];

export function button(
  text: string,
  run: () => void,
  className = "",
): HTMLButtonElement {
  return h("button", {
    className,
    text,
    attrs: { type: "button", title: text },
    on: { click: () => run() },
  });
}
/**
 * A labelled input. With `begin` the field is live: every `input` event is applied at once
 * (and `begin` runs before the first one, so a gesture is a single undo step).
 */
export function field(
  text: string,
  value: string | number,
  change: (value: string) => void,
  type = "text",
  begin?: () => void,
  suggestions?: string,
): HTMLLabelElement {
  let started = false;
  const read = (event: Event): string => (event.target as HTMLInputElement).value;
  const input = h("input", {
    attrs: { type, "aria-label": text, ...(suggestions ? { list: suggestions } : {}) },
    on: begin
      ? {
          input: (event) => {
            if (!started) begin();
            started = true;
            change(read(event));
          },
          change: () => {
            started = false;
          },
        }
      : { change: (event) => change(read(event)) },
  });
  input.value = String(value);
  return h("label", {}, h("span", { className: "label", text }), input);
}
export function datalist(id: string, values: string[]): HTMLDataListElement {
  return h(
    "datalist",
    { attrs: { id } },
    ...values.map((value) => h("option", { attrs: { value } })),
  );
}
export function select(
  text: string,
  options: Option[],
  value: string,
  change: (value: string) => void,
): HTMLLabelElement {
  const element = h(
    "select",
    {
      attrs: { "aria-label": text },
      on: { change: (event) => change((event.target as HTMLSelectElement).value) },
    },
    ...options.map((option) => {
      const [optionValue, label] = Array.isArray(option) ? option : [option, option];
      return h("option", { text: label, attrs: { value: optionValue } });
    }),
  );
  element.value = value;
  return h("label", {}, h("span", { className: "label", text }), element);
}
/** Toggle buttons for a closed set of names; none selected means "all". */
export function chips(
  label: string,
  choices: Choice[],
  selected: string[],
  toggle: (name: string) => void,
): HTMLElement {
  return h(
    "div",
    { className: "chips", attrs: { role: "group", "aria-label": label } },
    ...choices.map((choice) => {
      const chip = h("button", {
        className: "chip",
        text: choice.note ? `${choice.name} · ${choice.note}` : choice.name,
        attrs: {
          type: "button",
          "aria-pressed": String(selected.includes(choice.name)),
          "aria-label": `${label}: ${choice.name}`,
        },
        on: { click: () => toggle(choice.name) },
      });
      if (choice.color) chip.style.borderLeftColor = choice.color;
      return chip;
    }),
  );
}
export function group(title: string, ...children: (HTMLElement | null)[]): HTMLElement {
  return h(
    "section",
    { className: "group" },
    h("h3", { text: title }),
    ...children,
  );
}
export const hint = (text: string): HTMLElement =>
  h("p", { className: "hint", text });
export function toggled(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((item) => item !== name) : [...list, name];
}
