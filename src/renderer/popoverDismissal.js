function getDismissalElements(popover, ignoredElements) {
  return [popover, ...ignoredElements].filter(Boolean);
}

function containsTarget(element, target) {
  return target instanceof Node && element.contains(target);
}

export function createPopoverDismissalController({
  popover,
  ignoredElements = [],
}) {
  let pointerStartedInside = false;

  function isInsideDismissalElement(target) {
    return getDismissalElements(popover, ignoredElements).some((element) =>
      containsTarget(element, target),
    );
  }

  function handlePointerDown(event) {
    pointerStartedInside = isInsideDismissalElement(event.target);
  }

  function shouldDismiss(event) {
    if (popover.classList.contains("hidden")) {
      pointerStartedInside = false;
      return false;
    }

    if (pointerStartedInside) {
      pointerStartedInside = false;
      return false;
    }

    pointerStartedInside = false;
    return !isInsideDismissalElement(event.target);
  }

  return {
    handlePointerDown,
    shouldDismiss,
  };
}
