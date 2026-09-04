import { ElementPart, noChange } from "lit-html";
import { directive, Directive, type DirectiveResult, PartInfo, PartType } from "lit-html/directive.js";

class AutofocusOnOpenDirective extends Directive {
  private attached = false;

  constructor(partInfo: PartInfo) {
    super(partInfo);
    if (partInfo.type !== PartType.ELEMENT) throw new Error('[matchbox] autofocusOnOpen() goes in an element position');
  }

  render(): typeof noChange { return noChange; }

  update(part: ElementPart): typeof noChange {
    if (!this.attached) {
      this.attached = true;
      part.element.addEventListener('toggle', (event) => {
        if ((event as Event & { newState?: string }).newState !== 'open') return;
        // Skip if the browser correctly focuses
        if (part.element.contains(document.activeElement)) return;
        part.element.querySelector<HTMLElement>('[autofocus]')?.focus();
      });
    }
    return noChange;
  }
}

const autofocusDirective = directive(AutofocusOnOpenDirective);

export function autofocusOnOpen(): DirectiveResult {
  return autofocusDirective();
}
