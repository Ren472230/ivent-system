(globalThis as unknown as { Ivent: typeof Ivent }).Ivent = Ivent;

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  Ivent.installGameLibraryUI(document, window);
}
