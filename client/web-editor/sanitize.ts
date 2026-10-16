// Hover docs from a language server are Markdown rendered to HTML. Strip anything active.
declare const document: {
  createElement(tag: "template"): { innerHTML: string; content: { querySelectorAll(selector: string): ArrayLike<SafeElement> } };
};
type SafeElement = {
  remove(): void;
  attributes: ArrayLike<{ name: string; value: string }>;
  removeAttribute(name: string): void;
};

const BLOCKED = "script,style,iframe,object,embed,link,meta,form,input,button,textarea,select,base";

export function sanitizeHtml(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const node of Array.from(template.content.querySelectorAll(BLOCKED))) node.remove();
  for (const element of Array.from(template.content.querySelectorAll("*"))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && value.startsWith("javascript:"))) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  return template.innerHTML;
}
