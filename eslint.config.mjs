// Focused scanner lint; legacy files are intentionally not reformatted or weakened.
export default [{
  files:['lib/cardScanner/**/*.js','components/cards/**/*.js','app/api/card-factory/**/*.js','pages/card-scan.js','tests/cardScanner*.js'],
  languageOptions:{ecmaVersion:2022,sourceType:'module',parserOptions:{ecmaFeatures:{jsx:true}},globals:Object.fromEntries([
    'require','module','process','Buffer','__dirname','setTimeout','clearTimeout','fetch','Request','Response','URL','FormData','File','Blob','AbortController','AbortSignal','TextEncoder','crypto','indexedDB','window','document','navigator','console'
  ].map(name=>[name,'readonly']))},
  rules:{'no-undef':'error','no-debugger':'error','no-unreachable':'error','no-dupe-keys':'error','no-duplicate-case':'error','valid-typeof':'error','constructor-super':'error','no-unsafe-finally':'error','no-constant-binary-expression':'error'},
}];
