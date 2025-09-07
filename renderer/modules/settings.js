// renderer/modules/settings.js
export async function savePrefs(prefs){
  return await window.bibleAPI.savePrefs(prefs);
}
