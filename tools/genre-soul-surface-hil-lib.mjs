import { isUtf8 } from "node:buffer";
import { createHash } from "node:crypto";
import { posix } from "node:path";

export const PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA =
  "private-genre-soul-ambiguous-surface-request/v4";
export const PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_V3_SCHEMA =
  "private-genre-soul-ambiguous-surface-request/v3";
export const PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_DECISION_SCHEMA =
  "private-genre-soul-ambiguous-surface-decision/v3";
export const PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_REQUEST_SCHEMA =
  "private-genre-soul-batch-ambiguous-surface-request/v4";
export const PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_DECISION_SCHEMA =
  "private-genre-soul-batch-ambiguous-surface-decision/v4";
export const GENRE_SOUL_SURFACE_HIL_GATE_VERSION =
  "genre-soul-protected-surface-hil/v3";
export const GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION =
  "genre-soul-surface-candidate-extractor/v3";

const SURNAME_AMBIGUITY_RULE = "bare-korean-surname-shaped-2-4-overlap/v1";
const ORGANIZATION_STEM_AMBIGUITY_RULE = "bare-organization-stem-overlap/v1";
const ADJACENT_PERSON_AMBIGUITY_RULE = "adjacent-role-or-honorific/v1";
const QUOTED_SURFACE_AMBIGUITY_RULE = "quoted-private-surface-overlap/v1";
const LATIN_IDENTIFIER_AMBIGUITY_RULE = "latin-identifier-shaped-overlap/v1";
const ORGANIZATION_FULL_AMBIGUITY_RULE = "organization-full-form-overlap/v1";
const AMBIGUITY_RULES = new Set([
  ADJACENT_PERSON_AMBIGUITY_RULE,
  LATIN_IDENTIFIER_AMBIGUITY_RULE,
  ORGANIZATION_FULL_AMBIGUITY_RULE,
  QUOTED_SURFACE_AMBIGUITY_RULE,
  SURNAME_AMBIGUITY_RULE,
  ORGANIZATION_STEM_AMBIGUITY_RULE,
]);
const WINDOW_MAX_UTF8_BYTES = 768;
const WINDOW_CONTEXT_CODE_UNITS = 160;
const MAX_WINDOWS_PER_SIDE = 8;
const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_PRIVATE_REF = /^[A-Za-z0-9._:/-]{1,512}$/u;
const STAGES = new Set(["profile", "manager-qa"]);
const FINDING_DECISIONS = new Set([
  "generic-overlap-approved",
  "protected-reject",
]);
const SOUL_BY_GENRE = new Map([
  ["modern-fantasy-ko", "male-modern-fantasy-ko"],
  ["fantasy-ko", "male-fantasy-ko"],
  ["murim-ko", "male-murim-ko"],
]);

// This broad set is used only to route an orthographically ambiguous bare
// token to human review. Membership never makes a token a person and never
// creates an automatic block.
const AMBIGUOUS_SURNAME_INITIALS = new Set([
  ..."김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편",
]);
// These are explicit terms in the profile/manager contract ontology. They are
// safe only at the bare ambiguity-routing layer; exact identities, explicit
// anchors, and copied private surfaces still block normally.
const CONTRACT_ONTOLOGY_TERMS = new Set([
  "주인공", "경쟁자", "독자", "압박", "행동", "선택", "저항", "보상", "인정", "결과", "전환점", "기대감",
  "관계", "사건", "장면", "정보", "조직", "회사", "계약", "자산", "지위", "방식", "구조", "주기", "약속",
  "차이", "효과", "진행", "역할", "세계", "성장", "감정", "긴장", "위기", "승리", "실패", "다음화", "목격자",
  "기회", "현금", "기업", "대기업", "중견기업", "중소기업", "계열사", "본사", "법인", "인수", "투자", "사업",
  "시장", "이후", "이상", "이하", "이익", "이유", "우선", "문제", "성과", "선택지", "지원", "지속", "전략",
  "변화", "한계", "권한",
]);

// This is intentionally a role vocabulary, not a surname vocabulary. A bare
// two-syllable Korean token is never promoted to a person merely because its
// first syllable resembles a known surname.
const PERSON_ROLES = new Set([
  "가주", "검사", "교수", "교주", "국장", "군주", "기사", "대리", "대장", "도련님",
  "대표", "마왕", "무사", "박사", "부장", "사장", "상무", "선배", "선생", "소장",
  "스승", "실장", "아가씨", "왕", "원장", "이사", "장군", "전무", "점장", "주임",
  "차장", "총수", "팀장", "회장", "황제",
]);
const HONORIFICS = new Set(["군", "님", "선배", "선생", "씨", "양"]);
const ORGANIZATION_SUFFIXES = [
  "주식회사", "유한회사", "대학병원", "투자회사", "사모펀드", "문파", "재단", "그룹",
  "기업", "회사", "건설", "전자", "증권", "은행", "병원", "호텔", "학교", "대학",
  "본사", "상회", "상단", "세가", "가문", "종파", "길드", "왕국", "제국",
].sort((left, right) => right.length - left.length || compareStrings(left, right));
// These relational nouns attribute a way of acting or an operating identity
// to the immediately preceding stem. They are structural anchors, not a list
// of source terms or generic-word exceptions.
const ORGANIZATION_IDENTITY_ATTRIBUTIONS = new Set([
  "관행", "노선", "문화", "방식", "스타일", "수법", "원칙", "전략", "철학", "체계",
]);
const GRAMMATICAL_ENDINGS = [
  "이라고", "이라는", "이었으며", "이었고", "이었다", "에게서", "으로는", "에서는", "한테서",
  "라고", "라는", "였으며", "였고", "였다", "에게", "에서", "으로", "처럼", "보다", "까지",
  "부터", "하고", "한테", "이랑", "이며", "이고", "이니", "께서", "로는", "에는",
  "랑", "로", "은", "는", "이", "가", "을", "를", "의", "과", "와", "도", "만", "에",
].sort((left, right) => right.length - left.length || compareStrings(left, right));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(value, expected, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareStrings);
  const wanted = [...expected].sort(compareStrings);
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    throw new Error(`${label} keys must be exactly ${wanted.join(", ")}.`);
  }
}

function assertSha(value, label) {
  if (!SHA256.test(value ?? "")) throw new Error(`${label} must be a full SHA-256.`);
}

function assertPositiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
}

function assertNonNegativeSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function assertCanonicalIsoTimestamp(value, label) {
  const parsed = typeof value === "string" ? new Date(value) : null;
  if (
    !parsed
    || !Number.isFinite(parsed.getTime())
    || parsed.toISOString() !== value
  ) throw new Error(`${label} must be a canonical ISO-8601 UTC timestamp with milliseconds.`);
}

function assertSafeRelativePath(value, label) {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.includes("\\")
    || value.includes("\0")
    || value.startsWith("/")
    || posix.normalize(value) !== value
    || value === "."
    || value === ".."
    || value.startsWith("../")
  ) {
    throw new Error(`${label} must be a normalized safe relative path.`);
  }
}

function assertStageGenreSoul(stage, genre, soulId) {
  if (!STAGES.has(stage)) throw new Error(`Unsupported surface HIL stage: ${String(stage)}`);
  const expectedSoulId = SOUL_BY_GENRE.get(genre);
  if (!expectedSoulId) throw new Error(`Unsupported male genre Soul: ${String(genre)}`);
  if (soulId !== expectedSoulId) throw new Error(`Soul ID does not match genre ${genre}.`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareStrings);
}

function assertUniqueSortedStrings(values, label, validator) {
  if (!Array.isArray(values) || values.length < 1) {
    throw new Error(`${label} must be a non-empty array.`);
  }
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string" || value.length < 1 || !validator(value)) {
      throw new Error(`${label}[${index}] is invalid.`);
    }
  }
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  const sorted = [...values].sort(compareStrings);
  if (sorted.some((value, index) => value !== values[index])) {
    throw new Error(`${label} must be sorted.`);
  }
}

function assertUniqueSortedOptionalStrings(values, label, validator) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array.`);
  for (const [index, value] of values.entries()) {
    if (typeof value !== "string" || value.length < 1 || !validator(value)) {
      throw new Error(`${label}[${index}] is invalid.`);
    }
  }
  if (new Set(values).size !== values.length) throw new Error(`${label} must be unique.`);
  const sorted = [...values].sort(compareStrings);
  if (sorted.some((value, index) => value !== values[index])) {
    throw new Error(`${label} must be sorted.`);
  }
}

function assertJsonValue(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Candidate contains a non-finite number at ${path}.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertJsonValue(child, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) throw new Error(`Candidate is not JSON-safe at ${path}.`);
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error(`Candidate contains a non-plain object at ${path}.`);
  }
  for (const key of Object.keys(value).sort(compareStrings)) {
    assertJsonValue(value[key], jsonPathForKey(path, key));
  }
}

function canonicalJsonBytes(value) {
  assertJsonValue(value);
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function jsonPathForKey(parent, key) {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/u.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;
}

function collectCandidateStrings(value) {
  const strings = [];
  const visit = (child, path) => {
    if (typeof child === "string") {
      strings.push({ path, value: child.normalize("NFC") });
      return;
    }
    if (Array.isArray(child)) {
      child.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (isObject(child)) {
      for (const key of Object.keys(child).sort(compareStrings)) {
        visit(child[key], jsonPathForKey(path, key));
      }
    }
  };
  visit(value, "$");
  return strings.sort((left, right) => compareStrings(left.path, right.path));
}

function normalizedSurface(value) {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("en-US")
    .replace(/[^가-힣a-z0-9]+/gu, "");
}

function surfaceTokens(value) {
  return [...String(value ?? "").normalize("NFC").matchAll(/[가-힣A-Za-z0-9_-]+/gu)]
    .map((match) => ({
      raw: match[0],
      normalized: match[0].toLocaleLowerCase("en-US"),
      start: match.index,
      end: match.index + match[0].length,
    }));
}

function hasWhitespaceOnlyGap(value, left, right) {
  if (!left || !right || left.end > right.start) return false;
  const normalized = String(value ?? "").normalize("NFC");
  return /^(?:\t|\p{Zs})+$/u.test(normalized.slice(left.end, right.start));
}

function stripGrammaticalEnding(value, minimumBaseLength = 2) {
  let candidate = value;
  for (const ending of GRAMMATICAL_ENDINGS) {
    if (candidate.endsWith(ending) && [...candidate.slice(0, -ending.length)].length >= minimumBaseLength) {
      candidate = candidate.slice(0, -ending.length);
      break;
    }
  }
  return candidate;
}

function tokenBase(value) {
  return stripGrammaticalEnding(normalizedSurface(value));
}

function roleBase(value) {
  let candidate = stripGrammaticalEnding(normalizedSurface(value), 1);
  for (const honorific of HONORIFICS) {
    if (candidate.endsWith(honorific) && candidate.length > honorific.length) {
      candidate = candidate.slice(0, -honorific.length);
      break;
    }
  }
  return PERSON_ROLES.has(candidate) || HONORIFICS.has(candidate) ? candidate : null;
}

function personCandidate(value) {
  const candidate = tokenBase(value);
  return /^[가-힣]{2,4}$/u.test(candidate) ? candidate : null;
}

function isBareSurnameShapedAmbiguityCandidate(value) {
  return (
    /^[가-힣]{2,4}$/u.test(value)
    && AMBIGUOUS_SURNAME_INITIALS.has([...value][0])
    && !CONTRACT_ONTOLOGY_TERMS.has(value)
  );
}

function attachedPersonAnchor(value) {
  const token = tokenBase(value);
  for (const suffix of [...PERSON_ROLES, ...HONORIFICS].sort((left, right) => right.length - left.length)) {
    if (!token.endsWith(suffix)) continue;
    const candidate = token.slice(0, -suffix.length);
    if (/^[가-힣]{2,4}$/u.test(candidate)) return candidate;
  }
  return null;
}

function attachedOrganizationStructure(value) {
  const token = tokenBase(value);
  for (const suffix of ORGANIZATION_SUFFIXES) {
    if (!token.endsWith(suffix)) continue;
    const stem = token.slice(0, -suffix.length);
    if (!/^[가-힣a-z0-9_-]{2,20}$/u.test(stem)) return null;
    return { stem, full: `${stem}${suffix}` };
  }
  return null;
}

function organizationStructures(value) {
  const tokens = surfaceTokens(value);
  const structures = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const attached = attachedOrganizationStructure(tokens[index].normalized);
    if (attached) structures.push(attached);
    const next = tokens[index + 1];
    if (!hasWhitespaceOnlyGap(value, tokens[index], next)) continue;
    const suffix = ORGANIZATION_SUFFIXES.find((entry) => tokenBase(next.normalized) === entry);
    if (!suffix) continue;
    const stem = tokenBase(tokens[index].normalized);
    if (/^[가-힣a-z0-9_-]{2,20}$/u.test(stem)) {
      structures.push({ stem, full: `${stem}${suffix}` });
    }
  }
  return [...new Map(structures.map((entry) => [`${entry.stem}\u0000${entry.full}`, entry])).values()]
    .sort((left, right) => compareStrings(`${left.stem}\u0000${left.full}`, `${right.stem}\u0000${right.full}`));
}

function organizationStemTerms(value) {
  return new Set(organizationStructures(value).map((entry) => entry.stem));
}

function organizationIdentityAttributionTerms(value) {
  const tokens = surfaceTokens(value);
  const terms = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const base = tokenBase(token.normalized);
    if (!/^[가-힣a-z0-9_-]{2,20}$/u.test(base)) continue;
    const normalizedRaw = normalizedSurface(token.normalized);
    if (normalizedRaw.endsWith("의") && normalizedRaw !== base) terms.add(base);
    const next = tokens[index + 1];
    if (
      hasWhitespaceOnlyGap(value, token, next)
      && ORGANIZATION_IDENTITY_ATTRIBUTIONS.has(tokenBase(next.normalized))
    ) terms.add(base);
  }
  return terms;
}

function quotedSurfaceTerms(value) {
  const terms = new Set();
  for (const match of String(value).normalize("NFC")
    .matchAll(/["“”'‘’『』「」《》〈〉]([^"“”'‘’『』「」《》〈〉\r\n]{2,80})["“”'‘’『』「」《》〈〉]/gu)) {
    const term = normalizedSurface(match[1]);
    if (term.length >= 2) terms.add(term);
  }
  return terms;
}

function latinIdentifierTerms(value) {
  const terms = new Set();
  for (const token of surfaceTokens(value)) {
    if (isLatinPrivateIdentifier(token.raw)) terms.add(normalizedSurface(token.raw));
  }
  return terms;
}

function organizationFullTerms(value) {
  return new Set(organizationStructures(value).map((entry) => entry.full));
}

// Quote marks, Latin identifier morphology, and organization suffixes are
// properties of sample prose, not independently bound identities. Even when
// more than one of those shapes coincides (for example `“중견기업”`), the
// overlap remains a semantic-review candidate. Deterministic identity blocks
// come only from canonical selection metadata below.

// Role and honorific morphology is deliberately candidate-only in v3. Korean
// particles, punctuation, and compounds such as `정부군` can look identical to
// a person anchor after normalization; only the semantic reviewer may resolve
// these overlaps.
function adjacentPersonTerms(value) {
  const tokens = surfaceTokens(value);
  const terms = new Set();
  for (let index = 0; index < tokens.length; index += 1) {
    const attached = attachedPersonAnchor(tokens[index].normalized);
    if (attached) terms.add(attached);
    const candidate = personCandidate(tokens[index].normalized);
    if (
      candidate
      && isBareSurnameShapedAmbiguityCandidate(candidate)
      && (roleBase(tokens[index - 1]?.normalized) || roleBase(tokens[index + 1]?.normalized))
    ) terms.add(candidate);
  }
  return terms;
}

function isLatinPrivateIdentifier(value) {
  if (!/^[A-Za-z][A-Za-z0-9_-]{1,}$/u.test(value)) return false;
  if (/[0-9_-]/u.test(value)) return true;
  const uppercaseMatches = value.match(/[A-Z]/gu) ?? [];
  return uppercaseMatches.length >= 2 || /[a-z][A-Z]/u.test(value);
}

function candidateExactTerms(value) {
  const terms = new Set();
  for (const { normalized } of surfaceTokens(value)) {
    const base = tokenBase(normalized);
    if (base.length >= 2) terms.add(base);
    const attached = attachedPersonAnchor(normalized);
    if (attached) terms.add(attached);
  }
  for (const structure of organizationStructures(value)) terms.add(structure.full);
  return terms;
}

function ambiguousSurnameShapedTerms(value) {
  const terms = new Set();
  for (const { normalized } of surfaceTokens(value)) {
    const base = tokenBase(normalized);
    if (isBareSurnameShapedAmbiguityCandidate(base)) terms.add(base);
    // Korean subject/topic/object particles can be attached after the
    // name-final helper syllable `이` (김철이는/김철이가/김철이를).  The
    // first grammatical strip leaves 김철이, so retain the conservative
    // shorter ambiguity candidate as well instead of silently passing it.
    const withoutNameFinalHelper = base.endsWith("이") ? base.slice(0, -1) : "";
    if (isBareSurnameShapedAmbiguityCandidate(withoutNameFinalHelper)) {
      terms.add(withoutNameFinalHelper);
    }
  }
  return terms;
}

function normalizedSurfaceRangeMap(value) {
  const text = String(value).normalize("NFC");
  const units = [];
  let normalized = "";
  for (let start = 0; start < text.length;) {
    const codePoint = text.codePointAt(start);
    const rawUnit = String.fromCodePoint(codePoint);
    const end = start + rawUnit.length;
    const transformed = rawUnit.toLocaleLowerCase("en-US").replace(/[^가-힣a-z0-9]+/gu, "");
    for (const unit of transformed) {
      normalized += unit;
      units.push({ start, end });
    }
    start = end;
  }
  return { normalized, units };
}

function normalizedSurfaceRangesForTerm(value, term) {
  const mapped = normalizedSurfaceRangeMap(value);
  const ranges = [];
  let cursor = 0;
  while (cursor <= mapped.normalized.length - term.length) {
    const match = mapped.normalized.indexOf(term, cursor);
    if (match < 0) break;
    const first = mapped.units[match];
    const last = mapped.units[match + term.length - 1];
    if (first && last) ranges.push({ start: first.start, end: last.end });
    cursor = match + 1;
  }
  return ranges;
}

function tokenRangesForTerm(value, term) {
  const ranges = [];
  for (const token of surfaceTokens(value)) {
    const base = tokenBase(token.normalized);
    const helperless = base.endsWith("이") ? base.slice(0, -1) : "";
    const attachedPerson = attachedPersonAnchor(token.normalized);
    const organization = attachedOrganizationStructure(token.normalized);
    if (
      base === term
      || helperless === term
      || attachedPerson === term
      || organization?.stem === term
      || organization?.full === term
      || normalizedSurface(token.raw) === term
    ) ranges.push({ start: token.start, end: token.end });
  }
  if (ranges.length < 1) {
    ranges.push(...normalizedSurfaceRangesForTerm(value, term));
  }
  return ranges;
}

function safeSliceBoundary(value, index, direction) {
  let boundary = Math.max(0, Math.min(value.length, index));
  if (
    boundary > 0
    && boundary < value.length
    && /[\uDC00-\uDFFF]/u.test(value[boundary])
    && /[\uD800-\uDBFF]/u.test(value[boundary - 1])
  ) boundary += direction < 0 ? -1 : 1;
  return Math.max(0, Math.min(value.length, boundary));
}

function boundedRawWindow(value, range, side, reference, term) {
  const text = String(value).normalize("NFC");
  let start = safeSliceBoundary(text, range.start - WINDOW_CONTEXT_CODE_UNITS, -1);
  let end = safeSliceBoundary(text, range.end + WINDOW_CONTEXT_CODE_UNITS, 1);
  while (Buffer.byteLength(text.slice(start, end)) > WINDOW_MAX_UTF8_BYTES && (start < range.start || end > range.end)) {
    if (end - range.end >= range.start - start && end > range.end) {
      end = safeSliceBoundary(text, end - 1, -1);
    } else if (start < range.start) {
      start = safeSliceBoundary(text, start + 1, 1);
    }
  }
  const windowText = text.slice(start, end);
  const startUtf8Byte = Buffer.byteLength(text.slice(0, start));
  const endUtf8Byte = startUtf8Byte + Buffer.byteLength(windowText);
  const matchStartUtf8Byte = Buffer.byteLength(text.slice(start, range.start));
  const matchEndUtf8Byte = matchStartUtf8Byte + Buffer.byteLength(text.slice(range.start, range.end));
  const descriptor = {
    side,
    reference,
    startUtf8Byte,
    endUtf8Byte,
    matchStartUtf8Byte,
    matchEndUtf8Byte,
    textSha256: sha256(Buffer.from(windowText)),
    normalizedTermSha256: sha256(Buffer.from(term)),
  };
  return {
    windowId: `surface-window-${sha256(canonicalJsonBytes(descriptor)).slice(0, 24)}`,
    side,
    reference,
    startUtf8Byte,
    endUtf8Byte,
    matchStartUtf8Byte,
    matchEndUtf8Byte,
    text: windowText,
    textSha256: descriptor.textSha256,
  };
}

function rawWindowsForTerm(value, term, side, reference) {
  const ranges = tokenRangesForTerm(value, term);
  const selected = ranges.length <= MAX_WINDOWS_PER_SIDE
    ? ranges
    : [...ranges.slice(0, MAX_WINDOWS_PER_SIDE / 2), ...ranges.slice(-MAX_WINDOWS_PER_SIDE / 2)];
  const windows = [...new Map(selected.map((range) => {
    const window = boundedRawWindow(value, range, side, reference, term);
    return [window.windowId, window];
  })).values()].sort((left, right) => compareStrings(left.windowId, right.windowId));
  return { windows, complete: ranges.length <= MAX_WINDOWS_PER_SIDE && ranges.length > 0 };
}

function mergeBoundedWindowResults(results) {
  const all = [...new Map(results.flatMap((result) => result.windows)
    .map((window) => [window.windowId, window])).values()]
    .sort((left, right) => (
      compareStrings(left.reference, right.reference)
      || left.startUtf8Byte - right.startUtf8Byte
      || left.endUtf8Byte - right.endUtf8Byte
      || compareStrings(left.windowId, right.windowId)
    ));
  const selected = all.length <= MAX_WINDOWS_PER_SIDE
    ? all
    : [...all.slice(0, MAX_WINDOWS_PER_SIDE / 2), ...all.slice(-MAX_WINDOWS_PER_SIDE / 2)];
  return {
    windows: selected.sort((left, right) => compareStrings(left.windowId, right.windowId)),
    complete: results.every((result) => result.complete) && all.length <= MAX_WINDOWS_PER_SIDE,
  };
}

function privateSampleRef(sample, index) {
  if (!isObject(sample) || typeof sample.sourceText !== "string") {
    throw new Error(`Private sample ${index} must contain sourceText.`);
  }
  const candidates = [sample.privateRef, sample.sampleId, sample.selectorId]
    .filter((value) => value !== undefined);
  if (candidates.length < 1) {
    throw new Error(`Private sample ${index} requires privateRef, sampleId, or selectorId.`);
  }
  const reference = candidates[0];
  if (typeof reference !== "string" || !SAFE_PRIVATE_REF.test(reference)) {
    throw new Error(`Private sample ${index} reference is invalid.`);
  }
  return reference;
}

function normalizePrivateSamples(privateSamples) {
  if (!Array.isArray(privateSamples)) throw new Error("Private samples must be an array.");
  const byRef = new Map();
  for (const [index, sample] of privateSamples.entries()) {
    const reference = privateSampleRef(sample, index);
    const sourceText = sample.sourceText;
    const previous = byRef.get(reference);
    if (previous !== undefined && previous !== sourceText) {
      throw new Error(`Private sample reference is bound to different bytes: ${reference}`);
    }
    byRef.set(reference, sourceText);
  }
  return [...byRef.entries()]
    .map(([reference, sourceText]) => ({ reference, sourceText }))
    .sort((left, right) => compareStrings(left.reference, right.reference));
}

function textByteBinding(value, label) {
  if (typeof value !== "string" || value.length < 1) throw new Error(`${label} must be a non-empty string.`);
  const bytes = Buffer.from(value);
  return { sha256: sha256(bytes), sizeBytes: bytes.byteLength };
}

function canonicalSelectionSourceSet(selectionBindings) {
  if (!Array.isArray(selectionBindings)) throw new Error("Selection bindings must be an array.");
  const bySourceId = new Map();
  for (const [index, binding] of selectionBindings.entries()) {
    if (!isObject(binding)) throw new Error(`Selection binding ${index} must be an object.`);
    if (typeof binding.sourceId !== "string" || !SAFE_PRIVATE_REF.test(binding.sourceId)) {
      throw new Error(`Selection binding ${index}.sourceId is invalid.`);
    }
    assertSha(binding.sourceSha256, `Selection binding ${index}.sourceSha256`);
    const descriptor = {
      sourceId: binding.sourceId,
      sourceSha256: binding.sourceSha256,
      title: textByteBinding(binding.title, `Selection binding ${index}.title`),
      author: textByteBinding(binding.author, `Selection binding ${index}.author`),
    };
    const previous = bySourceId.get(binding.sourceId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(descriptor)) {
      throw new Error(`Selection source ID is bound to different metadata: ${binding.sourceId}`);
    }
    bySourceId.set(binding.sourceId, descriptor);
  }
  return [...bySourceId.values()].sort((left, right) => compareStrings(left.sourceId, right.sourceId));
}

function sampleSetDigestFromNormalized(samples) {
  const descriptor = {
    schemaVersion: "private-genre-soul-surface-sample-set-digest-input/v1",
    samples: samples.map((sample) => ({
      privateRef: sample.reference,
      sourceText: textByteBinding(sample.sourceText, `Private sample ${sample.reference}.sourceText`),
    })),
  };
  return sha256(canonicalJsonBytes(descriptor));
}

export function computeGenreSoulSurfaceSourceSetSha256(selectionBindings) {
  const descriptor = {
    schemaVersion: "private-genre-soul-surface-source-set-digest-input/v1",
    sources: canonicalSelectionSourceSet(selectionBindings),
  };
  return sha256(canonicalJsonBytes(descriptor));
}

export function computeGenreSoulSurfaceSampleSetSha256(privateSamples) {
  return sampleSetDigestFromNormalized(normalizePrivateSamples(privateSamples));
}

function selectionProtectedTerms(selectionBindings) {
  canonicalSelectionSourceSet(selectionBindings);
  const entries = [];
  for (const [index, binding] of selectionBindings.entries()) {
    if (!isObject(binding)) throw new Error(`Selection binding ${index} must be an object.`);
    for (const field of ["title", "author"]) {
      const value = binding[field];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`Selection binding ${index}.${field} must be a non-empty string.`);
      }
      const term = normalizedSurface(value);
      if (term.length >= 2) entries.push({
        term,
        reference: `selection:${String(binding.sourceId ?? index)}:${field}`,
      });
    }
  }
  return entries.sort((left, right) => (
    right.term.length - left.term.length
    || compareStrings(left.term, right.term)
    || compareStrings(left.reference, right.reference)
  ));
}

function hasFiveTokenCopy(candidateText, sampleText) {
  const candidateTokens = surfaceTokens(candidateText).map((entry) => entry.normalized);
  const sampleTokens = surfaceTokens(sampleText).map((entry) => entry.normalized);
  if (candidateTokens.length < 5 || sampleTokens.length < 5) return false;
  const candidateFiveGrams = new Set();
  for (let index = 0; index <= candidateTokens.length - 5; index += 1) {
    candidateFiveGrams.add(candidateTokens.slice(index, index + 5).join("\u001f"));
  }
  for (let index = 0; index <= sampleTokens.length - 5; index += 1) {
    if (candidateFiveGrams.has(sampleTokens.slice(index, index + 5).join("\u001f"))) return true;
  }
  return false;
}

function findingIdFor(context, finding) {
  const identity = {
    gateVersion: GENRE_SOUL_SURFACE_HIL_GATE_VERSION,
    extractorVersion: GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION,
    stage: context.stage,
    genre: context.genre,
    soulId: context.soulId,
    inputDigest: context.inputDigest,
    candidatePath: context.candidate.path,
    candidateSha256: context.candidate.sha256,
    sourceSetSha256: context.privateEvidence.sourceSetSha256,
    sampleSetSha256: context.privateEvidence.sampleSetSha256,
    rule: finding.rule,
    normalizedTerm: finding.normalizedTerm,
    candidateLocations: finding.candidateLocations,
    privateSampleRefs: finding.privateSampleRefs,
    candidateWindowIds: finding.candidateWindows.map((window) => window.windowId),
    privateSourceWindowIds: finding.privateSourceWindows.map((window) => window.windowId),
    windowCoverageComplete: finding.windowCoverageComplete,
  };
  return `surface-finding-${sha256(Buffer.from(JSON.stringify(identity))).slice(0, 24)}`;
}

function validateSurfaceWindow(window, expectedSide, label) {
  assertExactKeys(window, [
    "windowId", "side", "reference", "startUtf8Byte", "endUtf8Byte",
    "matchStartUtf8Byte", "matchEndUtf8Byte", "text", "textSha256",
  ], label);
  if (!/^surface-window-[0-9a-f]{24}$/u.test(window.windowId ?? "")) {
    throw new Error(`${label}.windowId is invalid.`);
  }
  if (window.side !== expectedSide) throw new Error(`${label}.side drifted.`);
  if (typeof window.reference !== "string" || !SAFE_PRIVATE_REF.test(window.reference)) {
    throw new Error(`${label}.reference is invalid.`);
  }
  for (const key of ["startUtf8Byte", "endUtf8Byte", "matchStartUtf8Byte", "matchEndUtf8Byte"]) {
    if (!Number.isSafeInteger(window[key]) || window[key] < 0) throw new Error(`${label}.${key} is invalid.`);
  }
  const bytes = Buffer.from(window.text ?? "");
  if (
    typeof window.text !== "string"
    || window.text !== window.text.normalize("NFC")
    || bytes.byteLength < 1
    || bytes.byteLength > WINDOW_MAX_UTF8_BYTES
    || window.endUtf8Byte - window.startUtf8Byte !== bytes.byteLength
    || window.matchStartUtf8Byte >= window.matchEndUtf8Byte
    || window.matchEndUtf8Byte > bytes.byteLength
    || sha256(bytes) !== window.textSha256
  ) throw new Error(`${label} byte binding is invalid.`);
  assertSha(window.textSha256, `${label}.textSha256`);
}

function validateFindingObject(finding, context, index) {
  const label = `surface finding ${index}`;
  assertExactKeys(finding, [
    "findingId", "rule", "normalizedTerm", "candidateLocations", "privateSampleRefs",
    "candidateWindows", "privateSourceWindows", "windowCoverageComplete",
  ], label);
  if (!AMBIGUITY_RULES.has(finding.rule)) throw new Error(`${label}.rule is unsupported.`);
  if (!isValidAmbiguityFindingTerm(finding.rule, finding.normalizedTerm)) {
    throw new Error(`${label}.normalizedTerm is invalid for ${finding.rule}.`);
  }
  assertUniqueSortedStrings(finding.candidateLocations, `${label}.candidateLocations`, isCandidateLocation);
  assertUniqueSortedStrings(finding.privateSampleRefs, `${label}.privateSampleRefs`, (value) => SAFE_PRIVATE_REF.test(value));
  if (!Array.isArray(finding.candidateWindows) || finding.candidateWindows.length < 1) {
    throw new Error(`${label}.candidateWindows must be non-empty.`);
  }
  if (!Array.isArray(finding.privateSourceWindows) || finding.privateSourceWindows.length < 1) {
    throw new Error(`${label}.privateSourceWindows must be non-empty.`);
  }
  finding.candidateWindows.forEach((window, windowIndex) => (
    validateSurfaceWindow(window, "candidate", `${label}.candidateWindows[${windowIndex}]`)
  ));
  finding.privateSourceWindows.forEach((window, windowIndex) => (
    validateSurfaceWindow(window, "private-source", `${label}.privateSourceWindows[${windowIndex}]`)
  ));
  for (const [key, windows] of [
    ["candidateWindows", finding.candidateWindows],
    ["privateSourceWindows", finding.privateSourceWindows],
  ]) {
    const ids = windows.map((window) => window.windowId);
    assertUniqueSortedStrings(ids, `${label}.${key} IDs`, (value) => /^surface-window-[0-9a-f]{24}$/u.test(value));
  }
  if (typeof finding.windowCoverageComplete !== "boolean") {
    throw new Error(`${label}.windowCoverageComplete must be boolean.`);
  }
  if (finding.findingId !== findingIdFor(context, finding)) throw new Error(`${label}.findingId drifted.`);
  return true;
}

function surfaceFindingSetSha256(findings) {
  return sha256(canonicalJsonBytes({
    schemaVersion: "private-genre-soul-surface-finding-set/v3",
    gateVersion: GENRE_SOUL_SURFACE_HIL_GATE_VERSION,
    extractorVersion: GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION,
    findings,
  }));
}

export function validateGenreSoulSurfaceSemanticEvaluation(evaluation) {
  assertExactKeys(evaluation, [
    "status", "stage", "genre", "soulId", "inputDigest", "candidate", "privateEvidence",
    "findings", "findingSetSha256", "blockers", "request", "requestBytes", "requestSha256",
  ], "surface semantic evaluation");
  if (evaluation.status !== "pending_semantic_review") {
    throw new Error("Surface semantic evaluation status drifted.");
  }
  assertStageGenreSoul(evaluation.stage, evaluation.genre, evaluation.soulId);
  assertSha(evaluation.inputDigest, "surface semantic evaluation inputDigest");
  assertExactKeys(evaluation.candidate, ["path", "sha256", "sizeBytes"], "surface semantic evaluation candidate");
  assertSafeRelativePath(evaluation.candidate.path, "surface semantic evaluation candidate.path");
  assertSha(evaluation.candidate.sha256, "surface semantic evaluation candidate.sha256");
  assertPositiveSafeInteger(evaluation.candidate.sizeBytes, "surface semantic evaluation candidate.sizeBytes");
  assertExactKeys(
    evaluation.privateEvidence,
    ["sourceSetSha256", "sampleSetSha256"],
    "surface semantic evaluation privateEvidence",
  );
  assertSha(evaluation.privateEvidence.sourceSetSha256, "surface semantic evaluation sourceSetSha256");
  assertSha(evaluation.privateEvidence.sampleSetSha256, "surface semantic evaluation sampleSetSha256");
  if (!Array.isArray(evaluation.findings) || evaluation.findings.length < 1) {
    throw new Error("Surface semantic evaluation findings must be non-empty.");
  }
  const context = {
    stage: evaluation.stage,
    genre: evaluation.genre,
    soulId: evaluation.soulId,
    inputDigest: evaluation.inputDigest,
    candidate: evaluation.candidate,
    privateEvidence: evaluation.privateEvidence,
  };
  evaluation.findings.forEach((finding, index) => validateFindingObject(finding, context, index));
  assertUniqueSortedStrings(
    evaluation.findings.map((finding) => finding.findingId),
    "surface semantic evaluation finding IDs",
    (value) => /^surface-finding-[0-9a-f]{24}$/u.test(value),
  );
  if (evaluation.findingSetSha256 !== surfaceFindingSetSha256(evaluation.findings)) {
    throw new Error("Surface semantic evaluation findingSetSha256 drifted.");
  }
  if (
    !Array.isArray(evaluation.blockers)
    || evaluation.blockers.length !== 0
    || evaluation.request !== null
    || evaluation.requestBytes !== null
    || evaluation.requestSha256 !== null
  ) throw new Error("Surface semantic evaluation must not carry deterministic blockers or owner HIL bytes.");
  return true;
}

function isValidAmbiguityFindingTerm(rule, value) {
  if (typeof value !== "string" || value !== value.normalize("NFC")) return false;
  if (rule === ADJACENT_PERSON_AMBIGUITY_RULE) return /^[가-힣]{2,4}$/u.test(value);
  if (rule === QUOTED_SURFACE_AMBIGUITY_RULE) {
    return value.length >= 2 && value.length <= 80 && normalizedSurface(value) === value;
  }
  if (rule === LATIN_IDENTIFIER_AMBIGUITY_RULE) {
    return value.length >= 2 && value.length <= 80 && /[a-z]/u.test(value) && /^[a-z0-9]+$/u.test(value);
  }
  if (rule === ORGANIZATION_FULL_AMBIGUITY_RULE) {
    return value.length >= 2 && value.length <= 40 && normalizedSurface(value) === value;
  }
  if (rule === SURNAME_AMBIGUITY_RULE) return isBareSurnameShapedAmbiguityCandidate(value);
  if (rule === ORGANIZATION_STEM_AMBIGUITY_RULE) {
    return /^[가-힣a-z0-9_-]{2,20}$/u.test(value) && normalizedSurface(value) === value;
  }
  return false;
}

function isCandidateLocation(value) {
  return value.startsWith("$") && value.length <= 1_024 && !/[\0\r\n]/u.test(value);
}

function validateSemanticReviewBinding(value, label = "semanticReview") {
  assertExactKeys(value, ["input", "result", "receipt"], label);
  for (const key of ["input", "result"]) {
    assertExactKeys(value[key], ["sha256", "sizeBytes"], `${label}.${key}`);
    assertSha(value[key].sha256, `${label}.${key}.sha256`);
    assertPositiveSafeInteger(value[key].sizeBytes, `${label}.${key}.sizeBytes`);
  }
  assertExactKeys(value.receipt, [
    "sha256", "sizeBytes", "role", "runId", "model", "provider", "reasoningEffort", "promptSha256",
  ], `${label}.receipt`);
  assertSha(value.receipt.sha256, `${label}.receipt.sha256`);
  assertPositiveSafeInteger(value.receipt.sizeBytes, `${label}.receipt.sizeBytes`);
  assertActorId(value.receipt.role, `${label}.receipt.role`);
  assertActorId(value.receipt.runId, `${label}.receipt.runId`);
  if (
    value.receipt.model !== "gpt-5.6-sol"
    || value.receipt.provider !== "openai-codex"
    || value.receipt.reasoningEffort !== "high"
  ) throw new Error(`${label}.receipt runtime identity drifted.`);
  assertSha(value.receipt.promptSha256, `${label}.receipt.promptSha256`);
  return true;
}

function validateSingleSemanticProjection(value, label = "semanticProjection") {
  assertExactKeys(value, [
    "findingSetSha256", "genericFindingIds", "protectedFindingIds", "uncertainFindingIds",
  ], label);
  assertSha(value.findingSetSha256, `${label}.findingSetSha256`);
  for (const key of ["genericFindingIds", "protectedFindingIds", "uncertainFindingIds"]) {
    assertUniqueSortedOptionalStrings(
      value[key],
      `${label}.${key}`,
      (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
    );
  }
  const findingIds = [
    ...value.genericFindingIds,
    ...value.protectedFindingIds,
    ...value.uncertainFindingIds,
  ].sort(compareStrings);
  if (new Set(findingIds).size !== findingIds.length) {
    throw new Error(`${label} verdict projections must be disjoint.`);
  }
  return { findingIds };
}

function buildAmbiguousSurfaceRequest(input, { legacyV3 = false } = {}) {
  if (!isObject(input)) throw new Error("Ambiguous surface request input must be an object.");
  const expectedKeys = [
    "stage", "genre", "soulId", "inputDigest", "candidate", "privateEvidence", "semanticReview", "findings",
  ];
  if (!legacyV3) expectedKeys.splice(7, 0, "semanticProjection");
  assertExactKeys(input, expectedKeys, "ambiguous surface request input");
  assertStageGenreSoul(input.stage, input.genre, input.soulId);
  assertSha(input.inputDigest, "inputDigest");
  assertExactKeys(input.candidate, ["path", "sha256", "sizeBytes"], "candidate");
  assertSafeRelativePath(input.candidate.path, "candidate.path");
  assertSha(input.candidate.sha256, "candidate.sha256");
  assertPositiveSafeInteger(input.candidate.sizeBytes, "candidate.sizeBytes");
  assertExactKeys(
    input.privateEvidence,
    ["sourceSetSha256", "sampleSetSha256"],
    "privateEvidence",
  );
  assertSha(input.privateEvidence.sourceSetSha256, "privateEvidence.sourceSetSha256");
  assertSha(input.privateEvidence.sampleSetSha256, "privateEvidence.sampleSetSha256");
  validateSemanticReviewBinding(input.semanticReview);
  if (!legacyV3) validateSingleSemanticProjection(input.semanticProjection);

  const context = {
    stage: input.stage,
    genre: input.genre,
    soulId: input.soulId,
    inputDigest: input.inputDigest,
    candidate: {
      path: input.candidate.path,
      sha256: input.candidate.sha256,
      sizeBytes: input.candidate.sizeBytes,
    },
    privateEvidence: {
      sourceSetSha256: input.privateEvidence.sourceSetSha256,
      sampleSetSha256: input.privateEvidence.sampleSetSha256,
    },
  };
  if (!Array.isArray(input.findings) || input.findings.length < 1) {
    throw new Error("Ambiguous surface request requires at least one uncertain finding.");
  }
  const findings = input.findings.map((finding) => structuredClone(finding))
    .sort((left, right) => compareStrings(left.findingId, right.findingId));
  findings.forEach((finding, index) => validateFindingObject(finding, context, index));
  assertUniqueSortedStrings(
    findings.map((finding) => finding.findingId),
    "ambiguous surface request finding IDs",
    (value) => /^surface-finding-[0-9a-f]{24}$/u.test(value),
  );
  if (!legacyV3) {
    if (
      input.semanticProjection.protectedFindingIds.length !== 0
      || input.semanticProjection.uncertainFindingIds.length < 1
      || JSON.stringify(findings.map((finding) => finding.findingId))
        !== JSON.stringify(input.semanticProjection.uncertainFindingIds)
    ) throw new Error("Ambiguous surface request requires the exact unblocked uncertain semantic projection.");
  }
  const request = {
    schemaVersion: legacyV3
      ? PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_V3_SCHEMA
      : PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA,
    gateVersion: GENRE_SOUL_SURFACE_HIL_GATE_VERSION,
    extractorVersion: GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION,
    stage: context.stage,
    genre: context.genre,
    soulId: context.soulId,
    inputDigest: context.inputDigest,
    candidate: context.candidate,
    privateEvidence: context.privateEvidence,
    semanticReview: structuredClone(input.semanticReview),
    ...(legacyV3 ? {} : { semanticProjection: structuredClone(input.semanticProjection) }),
    findings,
  };
  validateRequestObject(request);
  const bytes = canonicalJsonBytes(request);
  return { request, bytes, sha256: sha256(bytes) };
}

export function buildPrivateGenreSoulAmbiguousSurfaceRequest(input) {
  return buildAmbiguousSurfaceRequest(input);
}

export function buildPrivateGenreSoulAmbiguousSurfaceRequestV3(input) {
  return buildAmbiguousSurfaceRequest(input, { legacyV3: true });
}

function validateRequestObject(request) {
  const current = request?.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA;
  const legacyV3 = request?.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_V3_SCHEMA;
  if (!current && !legacyV3) throw new Error("Ambiguous surface request schema version drifted.");
  const expectedKeys = [
    "schemaVersion", "gateVersion", "extractorVersion", "stage", "genre", "soulId", "inputDigest", "candidate",
    "privateEvidence", "semanticReview", "findings",
  ];
  if (current) expectedKeys.splice(10, 0, "semanticProjection");
  assertExactKeys(request, expectedKeys, "ambiguous surface request");
  if (request.gateVersion !== GENRE_SOUL_SURFACE_HIL_GATE_VERSION) {
    throw new Error("Ambiguous surface request gate version drifted.");
  }
  if (request.extractorVersion !== GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION) {
    throw new Error("Ambiguous surface request extractor version drifted.");
  }
  assertStageGenreSoul(request.stage, request.genre, request.soulId);
  assertSha(request.inputDigest, "request.inputDigest");
  assertExactKeys(request.candidate, ["path", "sha256", "sizeBytes"], "request.candidate");
  assertSafeRelativePath(request.candidate.path, "request.candidate.path");
  assertSha(request.candidate.sha256, "request.candidate.sha256");
  assertPositiveSafeInteger(request.candidate.sizeBytes, "request.candidate.sizeBytes");
  assertExactKeys(
    request.privateEvidence,
    ["sourceSetSha256", "sampleSetSha256"],
    "request.privateEvidence",
  );
  assertSha(request.privateEvidence.sourceSetSha256, "request.privateEvidence.sourceSetSha256");
  assertSha(request.privateEvidence.sampleSetSha256, "request.privateEvidence.sampleSetSha256");
  validateSemanticReviewBinding(request.semanticReview, "request.semanticReview");
  const semanticProjection = current
    ? validateSingleSemanticProjection(request.semanticProjection, "request.semanticProjection")
    : null;
  if (!Array.isArray(request.findings) || request.findings.length < 1) {
    throw new Error("Ambiguous surface request findings must be non-empty.");
  }
  const context = {
    stage: request.stage,
    genre: request.genre,
    soulId: request.soulId,
    inputDigest: request.inputDigest,
    candidate: request.candidate,
    privateEvidence: request.privateEvidence,
  };
  const ids = [];
  for (const [index, finding] of request.findings.entries()) {
    validateFindingObject(finding, context, index);
    ids.push(finding.findingId);
  }
  assertUniqueSortedStrings(ids, "request finding IDs", (value) => /^surface-finding-[0-9a-f]{24}$/u.test(value));
  if (current && (
    request.semanticProjection.protectedFindingIds.length !== 0
    || request.semanticProjection.uncertainFindingIds.length < 1
    || JSON.stringify(ids) !== JSON.stringify(request.semanticProjection.uncertainFindingIds)
    || semanticProjection.findingIds.length < ids.length
  )) throw new Error("Ambiguous surface request semantic projection drifted from its uncertain findings.");
  return true;
}

export function validatePrivateGenreSoulAmbiguousSurfaceRequest(value) {
  let request;
  let suppliedBytes = null;
  if (typeof value === "string" || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    suppliedBytes = Buffer.from(value);
    if (!isUtf8(suppliedBytes)) throw new Error("Ambiguous surface request bytes must be UTF-8.");
    try {
      request = JSON.parse(suppliedBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Ambiguous surface request is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    request = value;
  }
  validateRequestObject(request);
  const bytes = canonicalJsonBytes(request);
  if (suppliedBytes && !suppliedBytes.equals(bytes)) {
    throw new Error("Ambiguous surface request bytes are not canonical.");
  }
  return { request, bytes, sha256: sha256(bytes) };
}

function validateBatchArtifactReference(value, label) {
  assertExactKeys(value, ["path", "sha256", "sizeBytes"], label);
  assertSafeRelativePath(value.path, `${label}.path`);
  assertSha(value.sha256, `${label}.sha256`);
  assertPositiveSafeInteger(value.sizeBytes, `${label}.sizeBytes`);
}

function validateBatchSemanticReviewBinding(value, label = "batchSemanticReview") {
  assertExactKeys(value, ["plan", "aggregate", "verdictCounts", "outcome", "parts"], label);
  validateBatchArtifactReference(value.plan, `${label}.plan`);
  validateBatchArtifactReference(value.aggregate, `${label}.aggregate`);
  assertExactKeys(
    value.verdictCounts,
    ["genericOverlap", "protectedIdentity", "uncertain"],
    `${label}.verdictCounts`,
  );
  for (const key of ["genericOverlap", "protectedIdentity", "uncertain"]) {
    assertNonNegativeSafeInteger(value.verdictCounts[key], `${label}.verdictCounts.${key}`);
  }
  if (!new Set(["blocked", "pending_hil", "pass"]).has(value.outcome)) {
    throw new Error(`${label}.outcome is invalid.`);
  }
  if (!Array.isArray(value.parts) || value.parts.length < 2 || value.parts.length > 9_999) {
    throw new Error(`${label}.parts must contain between two and 9,999 parts.`);
  }

  const artifactPaths = [value.plan.path, value.aggregate.path];
  const partIds = [];
  const findingIds = [];
  const genericFindingIds = [];
  const uncertainFindingIds = [];
  const protectedFindingIds = [];
  const reviewerRoles = [];
  const reviewerRunIds = [];
  for (const [index, part] of value.parts.entries()) {
    const partLabel = `${label}.parts[${index}]`;
    assertExactKeys(part, [
      "partId", "findingIds", "genericFindingIds", "uncertainFindingIds", "protectedFindingIds",
      "input", "result", "receipt", "reviewer",
    ], partLabel);
    if (!/^p[0-9]{4}$/u.test(part.partId ?? "") || part.partId === "p0000") {
      throw new Error(`${partLabel}.partId is invalid.`);
    }
    partIds.push(part.partId);
    assertUniqueSortedStrings(
      part.findingIds,
      `${partLabel}.findingIds`,
      (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
    );
    for (const key of ["genericFindingIds", "uncertainFindingIds", "protectedFindingIds"]) {
      assertUniqueSortedOptionalStrings(
        part[key],
        `${partLabel}.${key}`,
        (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
      );
    }
    const projectedFindingIds = [
      ...part.genericFindingIds,
      ...part.uncertainFindingIds,
      ...part.protectedFindingIds,
    ].sort(compareStrings);
    if (
      new Set(projectedFindingIds).size !== projectedFindingIds.length
      || JSON.stringify(projectedFindingIds) !== JSON.stringify(part.findingIds)
    ) throw new Error(`${partLabel} verdict projections must exactly partition findingIds.`);

    for (const key of ["input", "result", "receipt"]) {
      validateBatchArtifactReference(part[key], `${partLabel}.${key}`);
      artifactPaths.push(part[key].path);
    }
    assertExactKeys(part.reviewer, [
      "role", "runId", "model", "provider", "reasoningEffort", "promptSha256",
    ], `${partLabel}.reviewer`);
    assertActorId(part.reviewer.role, `${partLabel}.reviewer.role`);
    assertActorId(part.reviewer.runId, `${partLabel}.reviewer.runId`);
    if (
      !part.reviewer.role.startsWith("genre-soul-surface-semantic-review:")
      || part.reviewer.model !== "gpt-5.6-sol"
      || part.reviewer.provider !== "openai-codex"
      || part.reviewer.reasoningEffort !== "high"
    ) throw new Error(`${partLabel}.reviewer runtime identity drifted.`);
    assertSha(part.reviewer.promptSha256, `${partLabel}.reviewer.promptSha256`);

    findingIds.push(...part.findingIds);
    genericFindingIds.push(...part.genericFindingIds);
    uncertainFindingIds.push(...part.uncertainFindingIds);
    protectedFindingIds.push(...part.protectedFindingIds);
    reviewerRoles.push(part.reviewer.role);
    reviewerRunIds.push(part.reviewer.runId);
  }
  assertUniqueSortedStrings(partIds, `${label} part IDs`, (partId) => /^p[0-9]{4}$/u.test(partId));
  assertUniqueSortedStrings(
    findingIds,
    `${label} finding IDs`,
    (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
  );
  for (const [ids, key] of [
    [genericFindingIds, "genericFindingIds"],
    [uncertainFindingIds, "uncertainFindingIds"],
    [protectedFindingIds, "protectedFindingIds"],
  ]) {
    assertUniqueSortedOptionalStrings(
      [...ids].sort(compareStrings),
      `${label} ${key}`,
      (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
    );
  }
  if (new Set(artifactPaths).size !== artifactPaths.length) {
    throw new Error(`${label} artifact paths must be unique.`);
  }
  if (new Set(reviewerRoles).size !== reviewerRoles.length) {
    throw new Error(`${label} reviewer roles must be unique across parts.`);
  }
  if (new Set(reviewerRunIds).size !== reviewerRunIds.length) {
    throw new Error(`${label} reviewer runIds must be unique across parts.`);
  }
  if (
    value.verdictCounts.genericOverlap !== genericFindingIds.length
    || value.verdictCounts.uncertain !== uncertainFindingIds.length
    || value.verdictCounts.protectedIdentity !== protectedFindingIds.length
    || findingIds.length !== genericFindingIds.length + uncertainFindingIds.length + protectedFindingIds.length
  ) throw new Error(`${label}.verdictCounts drifted from the exact reviewer projections.`);
  const expectedOutcome = protectedFindingIds.length > 0
    ? "blocked"
    : uncertainFindingIds.length > 0
      ? "pending_hil"
      : "pass";
  if (value.outcome !== expectedOutcome) {
    throw new Error(`${label}.outcome drifted from the exact reviewer projections.`);
  }
  return {
    findingIds,
    genericFindingIds: [...genericFindingIds].sort(compareStrings),
    uncertainFindingIds: [...uncertainFindingIds].sort(compareStrings),
    protectedFindingIds: [...protectedFindingIds].sort(compareStrings),
  };
}

function validateBatchRequestObject(request) {
  assertExactKeys(request, [
    "schemaVersion", "gateVersion", "extractorVersion", "stage", "genre", "soulId", "inputDigest", "candidate",
    "privateEvidence", "batchSemanticReview", "findings",
  ], "batch ambiguous surface request");
  if (request.schemaVersion !== PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_REQUEST_SCHEMA) {
    throw new Error("Batch ambiguous surface request schema version drifted.");
  }
  if (request.gateVersion !== GENRE_SOUL_SURFACE_HIL_GATE_VERSION) {
    throw new Error("Batch ambiguous surface request gate version drifted.");
  }
  if (request.extractorVersion !== GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION) {
    throw new Error("Batch ambiguous surface request extractor version drifted.");
  }
  assertStageGenreSoul(request.stage, request.genre, request.soulId);
  assertSha(request.inputDigest, "batch request.inputDigest");
  assertExactKeys(request.candidate, ["path", "sha256", "sizeBytes"], "batch request.candidate");
  assertSafeRelativePath(request.candidate.path, "batch request.candidate.path");
  assertSha(request.candidate.sha256, "batch request.candidate.sha256");
  assertPositiveSafeInteger(request.candidate.sizeBytes, "batch request.candidate.sizeBytes");
  assertExactKeys(
    request.privateEvidence,
    ["sourceSetSha256", "sampleSetSha256"],
    "batch request.privateEvidence",
  );
  assertSha(request.privateEvidence.sourceSetSha256, "batch request.privateEvidence.sourceSetSha256");
  assertSha(request.privateEvidence.sampleSetSha256, "batch request.privateEvidence.sampleSetSha256");
  const projection = validateBatchSemanticReviewBinding(
    request.batchSemanticReview,
    "batch request.batchSemanticReview",
  );
  if (
    request.batchSemanticReview.outcome !== "pending_hil"
    || request.batchSemanticReview.verdictCounts.protectedIdentity !== 0
    || projection.protectedFindingIds.length !== 0
    || projection.uncertainFindingIds.length < 1
  ) throw new Error("Batch ambiguous surface request requires an unblocked pending_hil aggregate.");
  if (!Array.isArray(request.findings) || request.findings.length < 1) {
    throw new Error("Batch ambiguous surface request findings must be non-empty.");
  }
  const context = {
    stage: request.stage,
    genre: request.genre,
    soulId: request.soulId,
    inputDigest: request.inputDigest,
    candidate: request.candidate,
    privateEvidence: request.privateEvidence,
  };
  const findingIds = [];
  for (const [index, finding] of request.findings.entries()) {
    validateFindingObject(finding, context, index);
    findingIds.push(finding.findingId);
  }
  assertUniqueSortedStrings(
    findingIds,
    "batch request finding IDs",
    (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
  );
  if (JSON.stringify(findingIds) !== JSON.stringify(projection.uncertainFindingIds)) {
    throw new Error("Batch ambiguous surface request findings must equal the exact uncertain projection union.");
  }
  return true;
}

export function buildPrivateGenreSoulBatchAmbiguousSurfaceRequest(input) {
  if (!isObject(input)) throw new Error("Batch ambiguous surface request input must be an object.");
  assertExactKeys(input, [
    "stage", "genre", "soulId", "inputDigest", "candidate", "privateEvidence", "batchSemanticReview", "findings",
  ], "batch ambiguous surface request input");
  const findings = Array.isArray(input.findings)
    ? input.findings.map((finding) => structuredClone(finding))
      .sort((left, right) => compareStrings(left.findingId, right.findingId))
    : input.findings;
  const request = {
    schemaVersion: PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_REQUEST_SCHEMA,
    gateVersion: GENRE_SOUL_SURFACE_HIL_GATE_VERSION,
    extractorVersion: GENRE_SOUL_SURFACE_CANDIDATE_EXTRACTOR_VERSION,
    stage: input.stage,
    genre: input.genre,
    soulId: input.soulId,
    inputDigest: input.inputDigest,
    candidate: structuredClone(input.candidate),
    privateEvidence: structuredClone(input.privateEvidence),
    batchSemanticReview: structuredClone(input.batchSemanticReview),
    findings,
  };
  validateBatchRequestObject(request);
  const bytes = canonicalJsonBytes(request);
  return { request, bytes, sha256: sha256(bytes) };
}

export function validatePrivateGenreSoulBatchAmbiguousSurfaceRequest(value) {
  let request;
  let suppliedBytes = null;
  if (typeof value === "string" || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    suppliedBytes = Buffer.from(value);
    if (!isUtf8(suppliedBytes)) throw new Error("Batch ambiguous surface request bytes must be UTF-8.");
    try {
      request = JSON.parse(suppliedBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Batch ambiguous surface request is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    request = value;
  }
  validateBatchRequestObject(request);
  const bytes = canonicalJsonBytes(request);
  if (suppliedBytes && !suppliedBytes.equals(bytes)) {
    throw new Error("Batch ambiguous surface request bytes are not canonical.");
  }
  return { request, bytes, sha256: sha256(bytes) };
}

function assertActorId(value, label) {
  if (
    typeof value !== "string"
    || !/^[A-Za-z0-9._:@/-]{1,200}$/u.test(value)
    || value.includes("..")
  ) throw new Error(`${label} is invalid.`);
}

function outcomeForFindingDecisions(findingDecisions) {
  const actions = new Set(findingDecisions.map((entry) => entry.decision));
  if (actions.has("protected-reject")) return "rejected";
  return "approved";
}

function decisionIdentity(value) {
  const { decisionId: _decisionId, ...identity } = value;
  return identity;
}

function expectedDecisionId(value) {
  return `surface-decision-${sha256(canonicalJsonBytes(decisionIdentity(value))).slice(0, 24)}`;
}

function validateDecisionObject(decision, expected = {}) {
  assertExactKeys(decision, [
    "schemaVersion", "gateVersion", "stage", "genre", "soulId", "inputDigest",
    "request", "candidate", "privateEvidence", "semanticReview", "findingDecisions", "outcome",
    "decisionId", "decidedBy", "decidedAt", "authority",
  ], "ambiguous surface decision");
  if (decision.schemaVersion !== PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_DECISION_SCHEMA) {
    throw new Error("Ambiguous surface decision schema version drifted.");
  }
  if (decision.gateVersion !== GENRE_SOUL_SURFACE_HIL_GATE_VERSION) {
    throw new Error("Ambiguous surface decision gate version drifted.");
  }
  assertStageGenreSoul(decision.stage, decision.genre, decision.soulId);
  assertSha(decision.inputDigest, "decision.inputDigest");
  assertExactKeys(decision.request, ["path", "sha256", "sizeBytes"], "decision.request");
  assertSafeRelativePath(decision.request.path, "decision.request.path");
  assertSha(decision.request.sha256, "decision.request.sha256");
  assertPositiveSafeInteger(decision.request.sizeBytes, "decision.request.sizeBytes");
  assertExactKeys(decision.candidate, ["path", "sha256", "sizeBytes"], "decision.candidate");
  assertSafeRelativePath(decision.candidate.path, "decision.candidate.path");
  assertSha(decision.candidate.sha256, "decision.candidate.sha256");
  assertPositiveSafeInteger(decision.candidate.sizeBytes, "decision.candidate.sizeBytes");
  assertExactKeys(decision.privateEvidence, ["sourceSetSha256", "sampleSetSha256"], "decision.privateEvidence");
  assertSha(decision.privateEvidence.sourceSetSha256, "decision.privateEvidence.sourceSetSha256");
  assertSha(decision.privateEvidence.sampleSetSha256, "decision.privateEvidence.sampleSetSha256");
  validateSemanticReviewBinding(decision.semanticReview, "decision.semanticReview");
  if (!Array.isArray(decision.findingDecisions) || decision.findingDecisions.length < 1) {
    throw new Error("Ambiguous surface decision findingDecisions must be non-empty.");
  }
  const findingIds = [];
  for (const [index, findingDecision] of decision.findingDecisions.entries()) {
    assertExactKeys(findingDecision, ["findingId", "decision"], `decision.findingDecisions[${index}]`);
    if (!/^surface-finding-[0-9a-f]{24}$/u.test(findingDecision.findingId ?? "")) {
      throw new Error(`decision.findingDecisions[${index}].findingId is invalid.`);
    }
    if (!FINDING_DECISIONS.has(findingDecision.decision)) {
      throw new Error(`decision.findingDecisions[${index}].decision is invalid.`);
    }
    findingIds.push(findingDecision.findingId);
  }
  assertUniqueSortedStrings(
    findingIds,
    "decision finding IDs",
    (value) => /^surface-finding-[0-9a-f]{24}$/u.test(value),
  );
  if (decision.outcome !== outcomeForFindingDecisions(decision.findingDecisions)) {
    throw new Error("Ambiguous surface decision outcome drifted from its finding decisions.");
  }
  assertExactKeys(decision.decidedBy, ["actorId", "role"], "decision.decidedBy");
  assertActorId(decision.decidedBy.actorId, "decision.decidedBy.actorId");
  if (decision.decidedBy.role !== "owner") throw new Error("Ambiguous surface decision requires owner role.");
  assertCanonicalIsoTimestamp(decision.decidedAt, "Ambiguous surface decision decidedAt");
  assertExactKeys(decision.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul",
  ], "decision.authority");
  if (
    decision.authority.scope !== "reference-lab-analysis-surface-only"
    || decision.authority.mayWriteInkOSCanon !== false
    || decision.authority.mayPromoteSoul !== false
  ) throw new Error("Ambiguous surface decision authority drifted.");
  if (decision.decisionId !== expectedDecisionId(decision)) {
    throw new Error("Ambiguous surface decisionId drifted.");
  }

  if (expected.request !== undefined) {
    const requestValidation = validatePrivateGenreSoulAmbiguousSurfaceRequest(expected.request);
    const request = requestValidation.request;
    const expectedRequestPath = expected.requestPath;
    assertSafeRelativePath(expectedRequestPath, "expected requestPath");
    if (
      decision.request.path !== expectedRequestPath
      || decision.request.sha256 !== requestValidation.sha256
      || decision.request.sizeBytes !== requestValidation.bytes.byteLength
      || decision.stage !== request.stage
      || decision.genre !== request.genre
      || decision.soulId !== request.soulId
      || decision.inputDigest !== request.inputDigest
      || JSON.stringify(decision.candidate) !== JSON.stringify(request.candidate)
      || JSON.stringify(decision.privateEvidence) !== JSON.stringify(request.privateEvidence)
      || JSON.stringify(decision.semanticReview) !== JSON.stringify(request.semanticReview)
      || JSON.stringify(findingIds) !== JSON.stringify(request.findings.map((finding) => finding.findingId).sort(compareStrings))
    ) throw new Error("Ambiguous surface decision drifted from its exact request.");
  }
  return true;
}

export function buildPrivateGenreSoulAmbiguousSurfaceDecision(input) {
  if (!isObject(input)) throw new Error("Ambiguous surface decision input must be an object.");
  assertExactKeys(input, [
    "request", "requestPath", "findingDecisions", "decidedByActorId", "decidedByRole", "decidedAt",
  ], "ambiguous surface decision input");
  const requestValidation = validatePrivateGenreSoulAmbiguousSurfaceRequest(input.request);
  const request = requestValidation.request;
  assertSafeRelativePath(input.requestPath, "requestPath");
  assertActorId(input.decidedByActorId, "decidedByActorId");
  if (input.decidedByRole !== "owner") throw new Error("Ambiguous surface decision requires owner role.");
  assertCanonicalIsoTimestamp(input.decidedAt, "Ambiguous surface decision decidedAt");
  if (!Array.isArray(input.findingDecisions)) {
    throw new Error("Ambiguous surface findingDecisions must be an array.");
  }
  const decisionsById = new Map();
  for (const findingDecision of input.findingDecisions) {
    if (!isObject(findingDecision)) throw new Error("Ambiguous surface finding decision must be an object.");
    assertExactKeys(findingDecision, ["findingId", "decision"], "finding decision input");
    if (decisionsById.has(findingDecision.findingId)) throw new Error("Ambiguous surface finding decision is duplicated.");
    if (!FINDING_DECISIONS.has(findingDecision.decision)) throw new Error("Ambiguous surface finding decision is invalid.");
    decisionsById.set(findingDecision.findingId, findingDecision.decision);
  }
  const findingDecisions = request.findings.map((finding) => ({
    findingId: finding.findingId,
    decision: decisionsById.get(finding.findingId),
  })).sort((left, right) => compareStrings(left.findingId, right.findingId));
  if (
    findingDecisions.some((entry) => entry.decision === undefined)
    || decisionsById.size !== findingDecisions.length
  ) throw new Error("Ambiguous surface decision must cover the exact request finding set.");
  const decision = {
    schemaVersion: PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_DECISION_SCHEMA,
    gateVersion: GENRE_SOUL_SURFACE_HIL_GATE_VERSION,
    stage: request.stage,
    genre: request.genre,
    soulId: request.soulId,
    inputDigest: request.inputDigest,
    request: {
      path: input.requestPath,
      sha256: requestValidation.sha256,
      sizeBytes: requestValidation.bytes.byteLength,
    },
    candidate: request.candidate,
    privateEvidence: request.privateEvidence,
    semanticReview: request.semanticReview,
    findingDecisions,
    outcome: outcomeForFindingDecisions(findingDecisions),
    decisionId: "",
    decidedBy: { actorId: input.decidedByActorId, role: input.decidedByRole },
    decidedAt: input.decidedAt,
    authority: {
      scope: "reference-lab-analysis-surface-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
    },
  };
  decision.decisionId = expectedDecisionId(decision);
  validateDecisionObject(decision, { request: requestValidation.bytes, requestPath: input.requestPath });
  const bytes = canonicalJsonBytes(decision);
  return { decision, bytes, sha256: sha256(bytes) };
}

export function validatePrivateGenreSoulAmbiguousSurfaceDecision(value, expected = {}) {
  let decision;
  let suppliedBytes = null;
  if (typeof value === "string" || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    suppliedBytes = Buffer.from(value);
    if (!isUtf8(suppliedBytes)) throw new Error("Ambiguous surface decision bytes must be UTF-8.");
    try {
      decision = JSON.parse(suppliedBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Ambiguous surface decision is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    decision = value;
  }
  validateDecisionObject(decision, expected);
  const bytes = canonicalJsonBytes(decision);
  if (suppliedBytes && !suppliedBytes.equals(bytes)) {
    throw new Error("Ambiguous surface decision bytes are not canonical.");
  }
  return { decision, bytes, sha256: sha256(bytes) };
}

function validateBatchDecisionObject(decision, expected = {}) {
  assertExactKeys(decision, [
    "schemaVersion", "gateVersion", "stage", "genre", "soulId", "inputDigest",
    "request", "candidate", "privateEvidence", "batchSemanticReview", "findingDecisions", "outcome",
    "decisionId", "decidedBy", "decidedAt", "authority",
  ], "batch ambiguous surface decision");
  if (decision.schemaVersion !== PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_DECISION_SCHEMA) {
    throw new Error("Batch ambiguous surface decision schema version drifted.");
  }
  if (decision.gateVersion !== GENRE_SOUL_SURFACE_HIL_GATE_VERSION) {
    throw new Error("Batch ambiguous surface decision gate version drifted.");
  }
  assertStageGenreSoul(decision.stage, decision.genre, decision.soulId);
  assertSha(decision.inputDigest, "batch decision.inputDigest");
  assertExactKeys(decision.request, ["path", "sha256", "sizeBytes"], "batch decision.request");
  assertSafeRelativePath(decision.request.path, "batch decision.request.path");
  assertSha(decision.request.sha256, "batch decision.request.sha256");
  assertPositiveSafeInteger(decision.request.sizeBytes, "batch decision.request.sizeBytes");
  assertExactKeys(decision.candidate, ["path", "sha256", "sizeBytes"], "batch decision.candidate");
  assertSafeRelativePath(decision.candidate.path, "batch decision.candidate.path");
  assertSha(decision.candidate.sha256, "batch decision.candidate.sha256");
  assertPositiveSafeInteger(decision.candidate.sizeBytes, "batch decision.candidate.sizeBytes");
  assertExactKeys(
    decision.privateEvidence,
    ["sourceSetSha256", "sampleSetSha256"],
    "batch decision.privateEvidence",
  );
  assertSha(decision.privateEvidence.sourceSetSha256, "batch decision.privateEvidence.sourceSetSha256");
  assertSha(decision.privateEvidence.sampleSetSha256, "batch decision.privateEvidence.sampleSetSha256");
  const projection = validateBatchSemanticReviewBinding(
    decision.batchSemanticReview,
    "batch decision.batchSemanticReview",
  );
  if (
    decision.batchSemanticReview.outcome !== "pending_hil"
    || decision.batchSemanticReview.verdictCounts.protectedIdentity !== 0
    || projection.protectedFindingIds.length !== 0
    || projection.uncertainFindingIds.length < 1
  ) throw new Error("Batch ambiguous surface decision requires an unblocked pending_hil aggregate.");
  if (!Array.isArray(decision.findingDecisions) || decision.findingDecisions.length < 1) {
    throw new Error("Batch ambiguous surface decision findingDecisions must be non-empty.");
  }
  const findingIds = [];
  for (const [index, findingDecision] of decision.findingDecisions.entries()) {
    assertExactKeys(findingDecision, ["findingId", "decision"], `batch decision.findingDecisions[${index}]`);
    if (!/^surface-finding-[0-9a-f]{24}$/u.test(findingDecision.findingId ?? "")) {
      throw new Error(`batch decision.findingDecisions[${index}].findingId is invalid.`);
    }
    if (!FINDING_DECISIONS.has(findingDecision.decision)) {
      throw new Error(`batch decision.findingDecisions[${index}].decision is invalid.`);
    }
    findingIds.push(findingDecision.findingId);
  }
  assertUniqueSortedStrings(
    findingIds,
    "batch decision finding IDs",
    (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
  );
  if (JSON.stringify(findingIds) !== JSON.stringify(projection.uncertainFindingIds)) {
    throw new Error("Batch ambiguous surface decision must cover the exact uncertain projection union.");
  }
  if (decision.outcome !== outcomeForFindingDecisions(decision.findingDecisions)) {
    throw new Error("Batch ambiguous surface decision outcome drifted from its finding decisions.");
  }
  assertExactKeys(decision.decidedBy, ["actorId", "role"], "batch decision.decidedBy");
  assertActorId(decision.decidedBy.actorId, "batch decision.decidedBy.actorId");
  if (decision.decidedBy.role !== "owner") {
    throw new Error("Batch ambiguous surface decision requires owner role.");
  }
  assertCanonicalIsoTimestamp(decision.decidedAt, "Batch ambiguous surface decision decidedAt");
  assertExactKeys(decision.authority, [
    "scope", "mayWriteInkOSCanon", "mayPromoteSoul",
  ], "batch decision.authority");
  if (
    decision.authority.scope !== "reference-lab-analysis-surface-only"
    || decision.authority.mayWriteInkOSCanon !== false
    || decision.authority.mayPromoteSoul !== false
  ) throw new Error("Batch ambiguous surface decision authority drifted.");
  if (decision.decisionId !== expectedDecisionId(decision)) {
    throw new Error("Batch ambiguous surface decisionId drifted.");
  }

  if (expected.request !== undefined) {
    const requestValidation = validatePrivateGenreSoulBatchAmbiguousSurfaceRequest(expected.request);
    const request = requestValidation.request;
    const expectedRequestPath = expected.requestPath;
    assertSafeRelativePath(expectedRequestPath, "expected batch requestPath");
    if (
      decision.request.path !== expectedRequestPath
      || decision.request.sha256 !== requestValidation.sha256
      || decision.request.sizeBytes !== requestValidation.bytes.byteLength
      || decision.stage !== request.stage
      || decision.genre !== request.genre
      || decision.soulId !== request.soulId
      || decision.inputDigest !== request.inputDigest
      || JSON.stringify(decision.candidate) !== JSON.stringify(request.candidate)
      || JSON.stringify(decision.privateEvidence) !== JSON.stringify(request.privateEvidence)
      || JSON.stringify(decision.batchSemanticReview) !== JSON.stringify(request.batchSemanticReview)
      || JSON.stringify(findingIds) !== JSON.stringify(request.findings.map((finding) => finding.findingId))
    ) throw new Error("Batch ambiguous surface decision drifted from its exact request.");
  }
  return true;
}

export function buildPrivateGenreSoulBatchAmbiguousSurfaceDecision(input) {
  if (!isObject(input)) throw new Error("Batch ambiguous surface decision input must be an object.");
  assertExactKeys(input, [
    "request", "requestPath", "findingDecisions", "decidedByActorId", "decidedByRole", "decidedAt",
  ], "batch ambiguous surface decision input");
  const requestValidation = validatePrivateGenreSoulBatchAmbiguousSurfaceRequest(input.request);
  const request = requestValidation.request;
  assertSafeRelativePath(input.requestPath, "batch requestPath");
  assertActorId(input.decidedByActorId, "batch decidedByActorId");
  if (input.decidedByRole !== "owner") {
    throw new Error("Batch ambiguous surface decision requires owner role.");
  }
  assertCanonicalIsoTimestamp(input.decidedAt, "Batch ambiguous surface decision decidedAt");
  if (!Array.isArray(input.findingDecisions)) {
    throw new Error("Batch ambiguous surface findingDecisions must be an array.");
  }
  const decisionsById = new Map();
  for (const findingDecision of input.findingDecisions) {
    if (!isObject(findingDecision)) throw new Error("Batch ambiguous surface finding decision must be an object.");
    assertExactKeys(findingDecision, ["findingId", "decision"], "batch finding decision input");
    if (decisionsById.has(findingDecision.findingId)) {
      throw new Error("Batch ambiguous surface finding decision is duplicated.");
    }
    if (!FINDING_DECISIONS.has(findingDecision.decision)) {
      throw new Error("Batch ambiguous surface finding decision is invalid.");
    }
    decisionsById.set(findingDecision.findingId, findingDecision.decision);
  }
  const findingDecisions = request.findings.map((finding) => ({
    findingId: finding.findingId,
    decision: decisionsById.get(finding.findingId),
  })).sort((left, right) => compareStrings(left.findingId, right.findingId));
  if (
    findingDecisions.some((entry) => entry.decision === undefined)
    || decisionsById.size !== findingDecisions.length
  ) throw new Error("Batch ambiguous surface decision must cover the exact request finding set.");
  const decision = {
    schemaVersion: PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_DECISION_SCHEMA,
    gateVersion: GENRE_SOUL_SURFACE_HIL_GATE_VERSION,
    stage: request.stage,
    genre: request.genre,
    soulId: request.soulId,
    inputDigest: request.inputDigest,
    request: {
      path: input.requestPath,
      sha256: requestValidation.sha256,
      sizeBytes: requestValidation.bytes.byteLength,
    },
    candidate: request.candidate,
    privateEvidence: request.privateEvidence,
    batchSemanticReview: request.batchSemanticReview,
    findingDecisions,
    outcome: outcomeForFindingDecisions(findingDecisions),
    decisionId: "",
    decidedBy: { actorId: input.decidedByActorId, role: input.decidedByRole },
    decidedAt: input.decidedAt,
    authority: {
      scope: "reference-lab-analysis-surface-only",
      mayWriteInkOSCanon: false,
      mayPromoteSoul: false,
    },
  };
  decision.decisionId = expectedDecisionId(decision);
  validateBatchDecisionObject(decision, {
    request: requestValidation.bytes,
    requestPath: input.requestPath,
  });
  const bytes = canonicalJsonBytes(decision);
  return { decision, bytes, sha256: sha256(bytes) };
}

export function validatePrivateGenreSoulBatchAmbiguousSurfaceDecision(value, expected = {}) {
  let decision;
  let suppliedBytes = null;
  if (typeof value === "string" || Buffer.isBuffer(value) || value instanceof Uint8Array) {
    suppliedBytes = Buffer.from(value);
    if (!isUtf8(suppliedBytes)) throw new Error("Batch ambiguous surface decision bytes must be UTF-8.");
    try {
      decision = JSON.parse(suppliedBytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Batch ambiguous surface decision is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    decision = value;
  }
  validateBatchDecisionObject(decision, expected);
  const bytes = canonicalJsonBytes(decision);
  if (suppliedBytes && !suppliedBytes.equals(bytes)) {
    throw new Error("Batch ambiguous surface decision bytes are not canonical.");
  }
  return { decision, bytes, sha256: sha256(bytes) };
}

function validatePendingHilRequest(evaluation) {
  const suppliedBytes = Buffer.from(evaluation.requestBytes);
  if (!isUtf8(suppliedBytes)) throw new Error("Pending surface HIL request bytes must be UTF-8.");
  let parsed;
  try {
    parsed = JSON.parse(suppliedBytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Pending surface HIL request is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  let validation;
  if (
    parsed?.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA
    || parsed?.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_V3_SCHEMA
  ) {
    validation = validatePrivateGenreSoulAmbiguousSurfaceRequest(suppliedBytes);
  } else if (parsed?.schemaVersion === PRIVATE_GENRE_SOUL_BATCH_AMBIGUOUS_SURFACE_REQUEST_SCHEMA) {
    validation = validatePrivateGenreSoulBatchAmbiguousSurfaceRequest(suppliedBytes);
  } else {
    throw new Error("Pending surface HIL request schema is unsupported.");
  }
  assertSha(evaluation.requestSha256, "pending surface HIL requestSha256");
  if (
    evaluation.requestSha256 !== validation.sha256
    || !canonicalJsonBytes(evaluation.request).equals(validation.bytes)
  ) throw new Error("Pending surface HIL request object or digest drifted from its exact bytes.");
  const request = validation.request;
  assertStageGenreSoul(evaluation.stage, evaluation.genre, evaluation.soulId);
  assertSha(evaluation.inputDigest, "pending surface HIL evaluation inputDigest");
  assertExactKeys(
    evaluation.candidate,
    ["path", "sha256", "sizeBytes"],
    "pending surface HIL evaluation candidate",
  );
  assertSafeRelativePath(evaluation.candidate.path, "pending surface HIL evaluation candidate.path");
  assertSha(evaluation.candidate.sha256, "pending surface HIL evaluation candidate.sha256");
  assertPositiveSafeInteger(
    evaluation.candidate.sizeBytes,
    "pending surface HIL evaluation candidate.sizeBytes",
  );
  assertExactKeys(
    evaluation.privateEvidence,
    ["sourceSetSha256", "sampleSetSha256"],
    "pending surface HIL evaluation privateEvidence",
  );
  assertSha(
    evaluation.privateEvidence.sourceSetSha256,
    "pending surface HIL evaluation privateEvidence.sourceSetSha256",
  );
  assertSha(
    evaluation.privateEvidence.sampleSetSha256,
    "pending surface HIL evaluation privateEvidence.sampleSetSha256",
  );
  if (
    request.stage !== evaluation.stage
    || request.genre !== evaluation.genre
    || request.soulId !== evaluation.soulId
    || request.inputDigest !== evaluation.inputDigest
    || JSON.stringify(request.candidate) !== JSON.stringify(evaluation.candidate)
    || JSON.stringify(request.privateEvidence) !== JSON.stringify(evaluation.privateEvidence)
  ) throw new Error("Pending surface HIL request identity drifted from its exact evaluation.");
  if (!Array.isArray(evaluation.findings) || evaluation.findings.length < 1) {
    throw new Error("Pending surface HIL evaluation findings must be non-empty.");
  }
  const findingContext = {
    stage: evaluation.stage,
    genre: evaluation.genre,
    soulId: evaluation.soulId,
    inputDigest: evaluation.inputDigest,
    candidate: evaluation.candidate,
    privateEvidence: evaluation.privateEvidence,
  };
  evaluation.findings.forEach((finding, index) => validateFindingObject(finding, findingContext, index));
  const evaluationFindingIds = evaluation.findings.map((finding) => finding.findingId);
  assertUniqueSortedStrings(
    evaluationFindingIds,
    "pending surface HIL evaluation finding IDs",
    (findingId) => /^surface-finding-[0-9a-f]{24}$/u.test(findingId),
  );
  assertSha(evaluation.findingSetSha256, "pending surface HIL evaluation findingSetSha256");
  if (evaluation.findingSetSha256 !== surfaceFindingSetSha256(evaluation.findings)) {
    throw new Error("Pending surface HIL evaluation finding set drifted.");
  }
  if (!Array.isArray(evaluation.blockers) || evaluation.blockers.length !== 0) {
    throw new Error("Pending surface HIL evaluation must not carry blockers.");
  }
  const evaluationFindingById = new Map(
    evaluation.findings.map((finding) => [finding.findingId, finding]),
  );
  for (const finding of request.findings) {
    const evaluationFinding = evaluationFindingById.get(finding.findingId);
    if (!evaluationFinding || JSON.stringify(evaluationFinding) !== JSON.stringify(finding)) {
      throw new Error("Pending surface HIL request finding drifted from its exact evaluation.");
    }
  }
  if (
    request.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA
    || request.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_V3_SCHEMA
  ) {
    validateSemanticReviewBinding(
      evaluation.semanticReview,
      "pending surface HIL evaluation semanticReview",
    );
    if (JSON.stringify(request.semanticReview) !== JSON.stringify(evaluation.semanticReview)) {
      throw new Error("Pending surface HIL request semantic review drifted from its exact evaluation.");
    }
    if (request.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA) {
      const evaluationProjection = validateSingleSemanticProjection(
        evaluation.semanticProjection,
        "pending surface HIL evaluation semanticProjection",
      );
      if (
        request.semanticProjection.findingSetSha256 !== evaluation.findingSetSha256
        || JSON.stringify(request.semanticProjection) !== JSON.stringify(evaluation.semanticProjection)
        || JSON.stringify(evaluationProjection.findingIds) !== JSON.stringify(evaluationFindingIds)
      ) {
        throw new Error("Pending surface HIL request semantic projection drifted from its exact evaluation.");
      }
    }
  } else {
    const batchProjection = validateBatchSemanticReviewBinding(
      evaluation.batchSemanticReview,
      "pending surface HIL evaluation batchSemanticReview",
    );
    if (
      JSON.stringify(request.batchSemanticReview) !== JSON.stringify(evaluation.batchSemanticReview)
      || JSON.stringify(batchProjection.findingIds) !== JSON.stringify(evaluationFindingIds)
    ) {
      throw new Error("Pending batch surface HIL request drifted from its exact evaluation aggregate.");
    }
  }
  return validation;
}

export function resolveGenreSoulSurfaceHilDecision(evaluation, input) {
  if (
    !isObject(evaluation)
    || evaluation.status !== "pending_hil"
    || !evaluation.request
    || !evaluation.requestBytes
    || !evaluation.requestSha256
  ) throw new Error("Surface HIL decision requires an exact pending evaluation.");
  if (!isObject(input)) throw new Error("Surface HIL decision resolution input must be an object.");
  assertExactKeys(input, ["decision", "requestPath"], "surface HIL decision resolution input");
  const requestValidation = validatePendingHilRequest(evaluation);
  const singleRequest = (
    requestValidation.request.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_SCHEMA
    || requestValidation.request.schemaVersion === PRIVATE_GENRE_SOUL_AMBIGUOUS_SURFACE_REQUEST_V3_SCHEMA
  );
  const validation = singleRequest
    ? validatePrivateGenreSoulAmbiguousSurfaceDecision(input.decision, {
        request: requestValidation.bytes,
        requestPath: input.requestPath,
      })
    : validatePrivateGenreSoulBatchAmbiguousSurfaceDecision(input.decision, {
        request: requestValidation.bytes,
        requestPath: input.requestPath,
      });
  const decision = validation.decision;
  if (decision.outcome === "approved") {
    return {
      ...evaluation,
      status: "pass",
      decision: { decisionId: decision.decisionId, sha256: validation.sha256 },
    };
  }
  if (decision.outcome === "rejected") {
    return {
      ...evaluation,
      status: "blocked",
      blockers: decision.findingDecisions
        .filter((entry) => entry.decision === "protected-reject")
        .map((entry) => ({ rule: "owner-protected-reject/v1", findingId: entry.findingId })),
      decision: { decisionId: decision.decisionId, sha256: validation.sha256 },
    };
  }
  throw new Error("Surface HIL decision outcome is unsupported.");
}

function resolveCandidate(input) {
  const hasCandidate = Object.hasOwn(input, "candidate");
  const hasBytes = Object.hasOwn(input, "candidateBytes");
  if (hasCandidate === hasBytes) {
    throw new Error("Surface HIL evaluation requires exactly one of candidate or candidateBytes.");
  }
  if (hasCandidate) {
    const bytes = canonicalJsonBytes(input.candidate);
    return { value: input.candidate, bytes };
  }
  const bytes = Buffer.from(input.candidateBytes);
  if (!isUtf8(bytes)) throw new Error("Surface HIL candidate bytes must be UTF-8.");
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    throw new Error(`Surface HIL candidate is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  assertJsonValue(value);
  return { value, bytes };
}

export function evaluateGenreSoulSurfaceHil(input) {
  if (!isObject(input)) throw new Error("Surface HIL evaluation input must be an object.");
  const allowedKeys = new Set([
    "stage", "genre", "soulId", "inputDigest", "candidate", "candidateBytes", "selectionBindings",
    "candidatePath", "privateSamples", "sourceSetSha256", "sampleSetSha256",
  ]);
  const unexpected = Object.keys(input).filter((key) => !allowedKeys.has(key));
  if (unexpected.length > 0) throw new Error(`Surface HIL evaluation has unexpected keys: ${unexpected.sort().join(", ")}.`);
  assertStageGenreSoul(input.stage, input.genre, input.soulId);
  assertSha(input.inputDigest, "inputDigest");
  assertSafeRelativePath(input.candidatePath, "candidatePath");
  assertSha(input.sourceSetSha256, "sourceSetSha256");
  assertSha(input.sampleSetSha256, "sampleSetSha256");
  const candidate = resolveCandidate(input);
  const candidateDescriptor = {
    path: input.candidatePath,
    sha256: sha256(candidate.bytes),
    sizeBytes: candidate.bytes.byteLength,
  };
  const strings = collectCandidateStrings(candidate.value);
  const selectionBindings = input.selectionBindings ?? [];
  const privateSamples = input.privateSamples ?? [];
  const computedSourceSetSha256 = computeGenreSoulSurfaceSourceSetSha256(selectionBindings);
  if (input.sourceSetSha256 !== computedSourceSetSha256) {
    throw new Error("Surface HIL source-set SHA-256 does not match the canonical selection bindings.");
  }
  const computedSampleSetSha256 = computeGenreSoulSurfaceSampleSetSha256(privateSamples);
  if (input.sampleSetSha256 !== computedSampleSetSha256) {
    throw new Error("Surface HIL sample-set SHA-256 does not match the exact private sample bytes.");
  }
  const selectionTerms = selectionProtectedTerms(selectionBindings);
  const samples = normalizePrivateSamples(privateSamples);

  const blockers = [];
  const exactTermsBySample = new Map();
  const organizationStemsBySample = new Map();
  const organizationAttributionsBySample = new Map();
  for (const sample of samples) {
    const exactTerms = new Set();
    for (const token of surfaceTokens(sample.sourceText)) {
      const base = tokenBase(token.normalized);
      if (base.length >= 2) exactTerms.add(base);
    }
    for (const structure of organizationStructures(sample.sourceText)) exactTerms.add(structure.full);
    exactTermsBySample.set(sample.reference, exactTerms);
    organizationStemsBySample.set(sample.reference, organizationStemTerms(sample.sourceText));
    organizationAttributionsBySample.set(
      sample.reference,
      organizationIdentityAttributionTerms(sample.sourceText),
    );
  }
  for (const entry of strings) {
    const normalized = normalizedSurface(entry.value);
    for (const selection of selectionTerms) {
      if (normalized.includes(selection.term)) {
        blockers.push({
          rule: "exact-selection-identity/v1",
          candidateLocation: entry.path,
          evidenceRef: selection.reference,
        });
      }
    }
    for (const sample of samples) {
      if (hasFiveTokenCopy(entry.value, sample.sourceText)) {
        blockers.push({
          rule: "exact-private-surface-copy/v1",
          candidateLocation: entry.path,
          evidenceRef: sample.reference,
          tokenCount: 5,
        });
      }
    }
  }
  const canonicalBlockers = [...new Map(blockers.map((blocker) => [JSON.stringify(blocker), blocker])).values()]
    .sort((left, right) => compareStrings(JSON.stringify(left), JSON.stringify(right)));
  if (canonicalBlockers.length > 0) {
    return {
      status: "blocked",
      stage: input.stage,
      genre: input.genre,
      soulId: input.soulId,
      inputDigest: input.inputDigest,
      candidate: candidateDescriptor,
      privateEvidence: {
        sourceSetSha256: input.sourceSetSha256,
        sampleSetSha256: input.sampleSetSha256,
      },
      findings: [],
      findingSetSha256: null,
      blockers: canonicalBlockers,
      request: null,
      requestBytes: null,
      requestSha256: null,
    };
  }

  const findingInputsByRuleAndTerm = new Map();
  const addFinding = (rule, normalizedTerm, candidateLocation, privateRef) => {
    const key = `${rule}\u0000${normalizedTerm}`;
    const finding = findingInputsByRuleAndTerm.get(key) ?? {
      rule,
      normalizedTerm,
      candidateLocations: new Set(),
      privateSampleRefs: new Set(),
    };
    finding.candidateLocations.add(candidateLocation);
    finding.privateSampleRefs.add(privateRef);
    findingInputsByRuleAndTerm.set(key, finding);
  };

  const shapeTermsByRule = new Map([
    [QUOTED_SURFACE_AMBIGUITY_RULE, new Map()],
    [LATIN_IDENTIFIER_AMBIGUITY_RULE, new Map()],
    [ORGANIZATION_FULL_AMBIGUITY_RULE, new Map()],
  ]);
  const indexShapeTerms = (rule, terms, privateRef) => {
    const byTerm = shapeTermsByRule.get(rule);
    for (const term of terms) {
      const refs = byTerm.get(term) ?? new Set();
      refs.add(privateRef);
      byTerm.set(term, refs);
    }
  };
  for (const sample of samples) {
    indexShapeTerms(QUOTED_SURFACE_AMBIGUITY_RULE, quotedSurfaceTerms(sample.sourceText), sample.reference);
    indexShapeTerms(LATIN_IDENTIFIER_AMBIGUITY_RULE, latinIdentifierTerms(sample.sourceText), sample.reference);
    indexShapeTerms(ORGANIZATION_FULL_AMBIGUITY_RULE, organizationFullTerms(sample.sourceText), sample.reference);
  }
  for (const entry of strings) {
    const normalizedCandidate = normalizedSurface(entry.value);
    for (const [rule, byTerm] of shapeTermsByRule) {
      for (const [term, refs] of byTerm) {
        if (!normalizedCandidate.includes(term)) continue;
        for (const privateRef of refs) addFinding(rule, term, entry.path, privateRef);
      }
    }
    const candidateTermsByRule = new Map([
      [QUOTED_SURFACE_AMBIGUITY_RULE, quotedSurfaceTerms(entry.value)],
      [LATIN_IDENTIFIER_AMBIGUITY_RULE, latinIdentifierTerms(entry.value)],
      [ORGANIZATION_FULL_AMBIGUITY_RULE, organizationFullTerms(entry.value)],
    ]);
    for (const sample of samples) {
      const normalizedSample = normalizedSurface(sample.sourceText);
      for (const [rule, terms] of candidateTermsByRule) {
        for (const term of terms) {
          if (normalizedSample.includes(term)) addFinding(rule, term, entry.path, sample.reference);
        }
      }
    }
  }

  const sampleRefsByAdjacentTerm = new Map();
  for (const sample of samples) {
    for (const term of adjacentPersonTerms(sample.sourceText)) {
      const refs = sampleRefsByAdjacentTerm.get(term) ?? new Set();
      refs.add(sample.reference);
      sampleRefsByAdjacentTerm.set(term, refs);
    }
  }
  for (const entry of strings) {
    const candidateTerms = candidateExactTerms(entry.value);
    for (const [term, refs] of sampleRefsByAdjacentTerm) {
      if (!candidateTerms.has(term)) continue;
      for (const privateRef of refs) {
        addFinding(ADJACENT_PERSON_AMBIGUITY_RULE, term, entry.path, privateRef);
      }
    }
    for (const term of adjacentPersonTerms(entry.value)) {
      for (const sample of samples) {
        if (exactTermsBySample.get(sample.reference)?.has(term)) {
          addFinding(ADJACENT_PERSON_AMBIGUITY_RULE, term, entry.path, sample.reference);
        }
      }
    }
  }

  const sampleRefsByAmbiguousSurnameTerm = new Map();
  for (const sample of samples) {
    for (const term of ambiguousSurnameShapedTerms(sample.sourceText)) {
      const refs = sampleRefsByAmbiguousSurnameTerm.get(term) ?? new Set();
      refs.add(sample.reference);
      sampleRefsByAmbiguousSurnameTerm.set(term, refs);
    }
  }
  for (const entry of strings) {
    for (const term of ambiguousSurnameShapedTerms(entry.value)) {
      for (const privateRef of sampleRefsByAmbiguousSurnameTerm.get(term) ?? []) {
        addFinding(SURNAME_AMBIGUITY_RULE, term, entry.path, privateRef);
      }
    }

    const candidateExactTermsForEntry = candidateExactTerms(entry.value);
    const candidateOrganizationStems = organizationStemTerms(entry.value);
    const candidateOrganizationAttributions = organizationIdentityAttributionTerms(entry.value);
    for (const sample of samples) {
      const sampleOrganizationStems = organizationStemsBySample.get(sample.reference) ?? new Set();
      const sampleOrganizationAttributions = organizationAttributionsBySample.get(sample.reference) ?? new Set();
      const sampleExactTerms = exactTermsBySample.get(sample.reference) ?? new Set();
      for (const term of sampleOrganizationStems) {
        if (
          candidateExactTermsForEntry.has(term)
          || candidateOrganizationStems.has(term)
          || candidateOrganizationAttributions.has(term)
        ) {
          addFinding(ORGANIZATION_STEM_AMBIGUITY_RULE, term, entry.path, sample.reference);
        }
      }
      for (const term of candidateOrganizationStems) {
        if (
          sampleExactTerms.has(term)
          || sampleOrganizationStems.has(term)
          || sampleOrganizationAttributions.has(term)
        ) {
          addFinding(ORGANIZATION_STEM_AMBIGUITY_RULE, term, entry.path, sample.reference);
        }
      }
    }
  }
  const findingInputs = [...findingInputsByRuleAndTerm.values()]
    .map((finding) => ({
      rule: finding.rule,
      normalizedTerm: finding.normalizedTerm,
      candidateLocations: uniqueSorted(finding.candidateLocations),
      privateSampleRefs: uniqueSorted(finding.privateSampleRefs),
    }))
    .sort((left, right) => (
      compareStrings(left.rule, right.rule)
      || compareStrings(left.normalizedTerm, right.normalizedTerm)
    ));
  if (findingInputs.length < 1) {
    return {
      status: "pass",
      stage: input.stage,
      genre: input.genre,
      soulId: input.soulId,
      inputDigest: input.inputDigest,
      candidate: candidateDescriptor,
      privateEvidence: {
        sourceSetSha256: input.sourceSetSha256,
        sampleSetSha256: input.sampleSetSha256,
      },
      findings: [],
      findingSetSha256: null,
      blockers: [],
      request: null,
      requestBytes: null,
      requestSha256: null,
    };
  }
  const candidateByPath = new Map(strings.map((entry) => [entry.path, entry.value]));
  const sampleByRef = new Map(samples.map((sample) => [sample.reference, sample.sourceText]));
  const context = {
    stage: input.stage,
    genre: input.genre,
    soulId: input.soulId,
    inputDigest: input.inputDigest,
    candidate: candidateDescriptor,
    privateEvidence: {
      sourceSetSha256: input.sourceSetSha256,
      sampleSetSha256: input.sampleSetSha256,
    },
  };
  const findings = findingInputs.map((finding) => {
    const candidateWindowResults = finding.candidateLocations.map((location) => (
      rawWindowsForTerm(candidateByPath.get(location) ?? "", finding.normalizedTerm, "candidate", candidateDescriptor.path)
    ));
    const privateWindowResults = finding.privateSampleRefs.map((reference) => (
      rawWindowsForTerm(sampleByRef.get(reference) ?? "", finding.normalizedTerm, "private-source", reference)
    ));
    const boundedCandidate = mergeBoundedWindowResults(candidateWindowResults);
    const boundedPrivate = mergeBoundedWindowResults(privateWindowResults);
    const candidateWindows = boundedCandidate.windows;
    const privateSourceWindows = boundedPrivate.windows;
    if (candidateWindows.length < 1 || privateSourceWindows.length < 1) {
      throw new Error(`Surface semantic candidate cannot bind raw windows for ${finding.rule}.`);
    }
    const built = {
      findingId: "",
      ...finding,
      candidateWindows,
      privateSourceWindows,
      windowCoverageComplete: boundedCandidate.complete && boundedPrivate.complete,
    };
    built.findingId = findingIdFor(context, built);
    return built;
  }).sort((left, right) => compareStrings(left.findingId, right.findingId));
  findings.forEach((finding, index) => validateFindingObject(finding, context, index));
  const findingSetSha256 = surfaceFindingSetSha256(findings);
  const evaluation = {
    status: "pending_semantic_review",
    stage: input.stage,
    genre: input.genre,
    soulId: input.soulId,
    inputDigest: input.inputDigest,
    candidate: candidateDescriptor,
    privateEvidence: context.privateEvidence,
    findings,
    findingSetSha256,
    blockers: [],
    request: null,
    requestBytes: null,
    requestSha256: null,
  };
  validateGenreSoulSurfaceSemanticEvaluation(evaluation);
  return evaluation;
}
