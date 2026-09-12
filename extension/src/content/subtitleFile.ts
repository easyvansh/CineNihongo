export interface FileCue { start: number; end: number; text: string; }
const time = (value: string) => { const p = value.trim().replace(",", ".").split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

export function parseSubtitleFile(input: string): FileCue[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r/g, "");
  const cues: FileCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.trim().split("\n");
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const match = lines[timingIndex].match(/([\d:,.]+)\s*-->\s*([\d:,.]+)/);
    if (!match) continue;
    const text = lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text) cues.push({ start: time(match[1]), end: time(match[2]), text });
  }
  return cues.sort((a, b) => a.start - b.start);
}

export function cueAt(cues: FileCue[], mediaTime: number) { return cues.find((cue) => cue.start <= mediaTime && cue.end >= mediaTime) ?? null; }

const KANA: Record<string, string> = {
  あ:"a",い:"i",う:"u",え:"e",お:"o",か:"ka",き:"ki",く:"ku",け:"ke",こ:"ko",さ:"sa",し:"shi",す:"su",せ:"se",そ:"so",た:"ta",ち:"chi",つ:"tsu",て:"te",と:"to",な:"na",に:"ni",ぬ:"nu",ね:"ne",の:"no",は:"ha",ひ:"hi",ふ:"fu",へ:"he",ほ:"ho",ま:"ma",み:"mi",む:"mu",め:"me",も:"mo",や:"ya",ゆ:"yu",よ:"yo",ら:"ra",り:"ri",る:"ru",れ:"re",ろ:"ro",わ:"wa",を:"o",ん:"n",
  が:"ga",ぎ:"gi",ぐ:"gu",げ:"ge",ご:"go",ざ:"za",じ:"ji",ず:"zu",ぜ:"ze",ぞ:"zo",だ:"da",ぢ:"ji",づ:"zu",で:"de",ど:"do",ば:"ba",び:"bi",ぶ:"bu",べ:"be",ぼ:"bo",ぱ:"pa",ぴ:"pi",ぷ:"pu",ぺ:"pe",ぽ:"po",
  きゃ:"kya",きゅ:"kyu",きょ:"kyo",しゃ:"sha",しゅ:"shu",しょ:"sho",ちゃ:"cha",ちゅ:"chu",ちょ:"cho",にゃ:"nya",にゅ:"nyu",にょ:"nyo",ひゃ:"hya",ひゅ:"hyu",ひょ:"hyo",みゃ:"mya",みゅ:"myu",みょ:"myo",りゃ:"rya",りゅ:"ryu",りょ:"ryo",ぎゃ:"gya",ぎゅ:"gyu",ぎょ:"gyo",じゃ:"ja",じゅ:"ju",じょ:"jo",びゃ:"bya",びゅ:"byu",びょ:"byo",ぴゃ:"pya",ぴゅ:"pyu",ぴょ:"pyo"
};
export function fallbackRomanize(input: string): string {
  const hira = input.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60)); let output = ""; let double = false;
  for (let i = 0; i < hira.length; i += 1) { const char = hira[i]; if (char === "っ") { double = true; continue; } const value = KANA[hira.slice(i, i + 2)] ?? KANA[char]; if (!value) { output += char; continue; } if (KANA[hira.slice(i, i + 2)]) i += 1; output += double ? value[0] + value : value; double = false; }
  return output.replace(/([a-z])([^a-z\s])/gi, "$1 $2").replace(/([^a-z\s])([a-z])/gi, "$1 $2").replace(/\s+/g, " ").trim();
}
