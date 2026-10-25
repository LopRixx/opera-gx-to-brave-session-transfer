// Seul role : ouvrir la page de l'outil dans un onglet. Aucun reseau, aucune donnee.
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
});
