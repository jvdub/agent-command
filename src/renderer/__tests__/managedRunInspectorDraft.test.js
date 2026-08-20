import { preserveInspectorDraft } from "../managedRunsView.js";

test("keeps the focused Shape draft editable across asynchronous inspector refreshes", () => {
  document.body.innerHTML = `<section id="inspector"><textarea data-shape-summary>saved summary</textarea></section>`;
  const inspector = document.querySelector("#inspector");
  const editor = inspector.querySelector("[data-shape-summary]");
  editor.value = "user is still typing";
  editor.focus();
  editor.setSelectionRange(7, 15);

  preserveInspectorDraft(inspector, () => {
    inspector.innerHTML = `<textarea data-shape-summary>refreshed server summary</textarea>`;
  });

  const refreshedEditor = inspector.querySelector("[data-shape-summary]");
  expect(refreshedEditor.value).toBe("user is still typing");
  expect(document.activeElement).toBe(refreshedEditor);
  expect(refreshedEditor.selectionStart).toBe(7);
  expect(refreshedEditor.selectionEnd).toBe(15);
});

test("uses refreshed Shape evidence when the editor is not being edited", () => {
  document.body.innerHTML = `<section id="inspector"><textarea data-shape-summary>old summary</textarea></section>`;
  const inspector = document.querySelector("#inspector");

  preserveInspectorDraft(inspector, () => {
    inspector.innerHTML = `<textarea data-shape-summary>refreshed server summary</textarea>`;
  });

  expect(inspector.querySelector("[data-shape-summary]").value).toBe("refreshed server summary");
});
