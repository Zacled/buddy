/**
 * HumanType Pro — Gmail compose adapter.
 *
 * Gmail's compose body is a `contenteditable` div labelled "Message Body".
 * We extend the generic contenteditable adapter and simply teach it how to find
 * that element (preferring the one the user has focused if several composes are
 * open).
 */

import { ContentEditableAdapter } from './contenteditable-adapter';

export class GmailAdapter extends ContentEditableAdapter {
  override readonly kind = 'gmail';
  override readonly label = 'Gmail compose';

  protected override resolveTarget(): HTMLElement | null {
    // Prefer the focused compose body, else the first open one.
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      focused.isContentEditable &&
      focused.getAttribute('aria-label')?.includes('Message Body')
    ) {
      return focused;
    }
    return (
      document.querySelector<HTMLElement>('div[aria-label="Message Body"][contenteditable="true"]') ??
      document.querySelector<HTMLElement>('div[g_editable="true"][role="textbox"]')
    );
  }

  override canHandle(): boolean {
    return location.hostname.endsWith('mail.google.com') && this.resolveTarget() !== null;
  }
}
