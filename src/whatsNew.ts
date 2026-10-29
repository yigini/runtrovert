import { live, ui } from './i18n/ui';
// Feature news, the local way: one line on the home screen after an update,
// shown once. The store's update notes carry the rest. Bump the id with each
// release that has something worth a line; leave it alone otherwise.
export const NEWS = live(() => ({
  id: '2026-11-todays-run',
  text: ui().whatsNew.text,
}));
