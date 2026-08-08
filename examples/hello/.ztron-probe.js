console.log("tjs keys:", Object.keys(tjs).filter(k=>/stat|copy|rename|read|write|remove|make|readDir|access|mkdir/.test(k)).join(","))
