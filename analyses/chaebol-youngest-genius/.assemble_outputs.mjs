import fs from 'node:fs';
import path from 'node:path';

const outDir = path.dirname(new URL(import.meta.url).pathname);
const chapterParts = ['001-095', '096-190', '191-285', '286-380'];
const pacingParts = [...chapterParts];

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field.endsWith('\r') ? field.slice(0, -1) : field); rows.push(row); row = []; field = ''; }
    else field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
function cell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function encode(rows) { return `${rows.map((row) => row.map(cell).join(',')).join('\n')}\n`; }
function readPart(kind, part) { return parseCsv(fs.readFileSync(path.join(outDir, `${kind}.part-${part}.csv`), 'utf8')); }

const chapterTables = chapterParts.map((part) => readPart('chapter_map', part));
const pacingTables = pacingParts.map((part) => readPart('arc_pacing', part));
for (const tables of [chapterTables, pacingTables]) {
  const header = tables[0][0].join(',');
  if (tables.some((table) => table[0].join(',') !== header)) throw new Error('part header mismatch');
}

const chapterHeader = chapterTables[0][0];
const pacingHeader = pacingTables[0][0];
const chapterRows = chapterTables.flatMap((table) => table.slice(1));
const pacingRows = pacingTables.flatMap((table) => table.slice(1));
if (chapterRows.length !== 380 || pacingRows.length !== 380) throw new Error('row count mismatch');
const ch = Object.fromEntries(chapterHeader.map((name, index) => [name, index]));
const pc = Object.fromEntries(pacingHeader.map((name, index) => [name, index]));

const rawArcIds = [];
for (const row of chapterRows) if (rawArcIds.at(-1) !== row[ch.arc_id]) rawArcIds.push(row[ch.arc_id]);
const remap = new Map(rawArcIds.map((id, index) => [id, `ARC-${String(index + 1).padStart(3, '0')}`]));
if (remap.size !== rawArcIds.length) throw new Error('non-contiguous raw arc id reuse');

for (const [index, row] of chapterRows.entries()) {
  const seq = index + 1;
  if (Number(row[ch.sequence]) !== seq) throw new Error(`chapter sequence ${seq}`);
  row[ch.arc_id] = remap.get(row[ch.arc_id]);
  row[ch.entry_state] = `${row[ch.entry_state]} [직전 ${Math.max(0, seq - 1)}화까지의 상태에서 진입]`;
}
for (const [index, row] of pacingRows.entries()) {
  const seq = index + 1;
  if (Number(row[pc.sequence]) !== seq) throw new Error(`pacing sequence ${seq}`);
  const mapped = remap.get(row[pc.arc_id]);
  if (!mapped) throw new Error(`unknown pacing arc ${row[pc.arc_id]}`);
  row[pc.arc_id] = mapped;
}

fs.writeFileSync(path.join(outDir, 'chapter_map.csv'), encode([chapterHeader, ...chapterRows]));
fs.writeFileSync(path.join(outDir, 'arc_pacing.csv'), encode([pacingHeader, ...pacingRows]));

const summaries = {
  A01:['검사의 죽음과 재벌가 회귀','김동진·허상도·차광철','검찰청·사채업 사무실·병원','김동진이 허상도 수사로 제거된 뒤 그의 막내아들 허준수로 돌아가 가족과 권력의 원점을 다시 잡는다'],
  A02:['막내의 첫 가족 구조','허준수·허상도·누나들','대산가 저택·병원·학교','회귀한 준수가 가족의 위험과 숨은 관계를 읽고 막내가 아닌 해결자로 첫 자리를 얻는다'],
  A03:['언어와 기억의 첫 증명','허준수·허상도·교사','학교·대산가','암기와 언어 재능을 눈앞에서 증명해 교육 선택권과 부친의 신뢰를 얻는다'],
  A04:['선악의 저울과 사람 고르기','허준수·가족·주변 인물','대산가·학교','사람의 선악을 읽는 능력으로 위험한 편과 쓸 사람을 가르며 관계 지도를 다시 짠다'],
  A05:['땅과 미래를 사는 막내','허준수·허상도·부동산 관계자','서울·강남·대산 회장실','미래 개발 정보를 가족 자본과 결합해 막내의 지식이 실물 자산이 되는 첫 환전을 완성한다'],
  A06:['대산의 숨은 후계 수업','허준수·허상도·대산 임원','대산 그룹·가족 저택','준수가 위기와 사업 기회를 연속으로 맞히며 부친에게 비공식 전략가로 인정받는다'],
  A07:['가족의 적을 가르는 칼','허준수·허상도·가족 적대자','대산가·사무실','선악 판별과 법률 기억으로 가족을 노리는 상대를 드러내고 막내의 보호자 역할을 굳힌다'],
  A08:['학교 무대의 공개 증명','허준수·학생·교사','학교','가정 안에서만 보였던 천재성이 학교의 시험과 대결을 통해 동년배 사회에 공개된다'],
  A09:['미래 산업의 첫 씨앗','허준수·허상도·기업인','대산 그룹·서울','미래 소비와 기술 흐름을 사업안으로 바꿔 대산이 새 산업에 먼저 들어갈 명분을 만든다'],
  A10:['외환과 일본을 읽는 아이','허준수·허상도·김 실장','한국·일본·대산 그룹','환율과 일본 자산의 미래를 읽어 가족 자본을 국경 밖으로 옮기며 금융 능력을 입증한다'],
  A11:['가족 자본의 세계 진출','허준수·허상도·해외 파트너','일본·미국·대산','국내 사채 자본을 합법 투자와 해외 지분으로 전환해 가족의 신분과 사업판을 함께 바꾼다'],
  A12:['누나들의 상처와 막내의 개입','허준수·누나들·허상도','대산가·학교·가족 사업장','사업 성공과 별개로 누나들의 관계·혼인 위험에 개입해 가족 인정의 다른 통화를 얻는다'],
  A13:['미국 증시의 첫 대어','허준수·그레이·미국 기업인','뉴욕·리버마운틴','미래 기업을 골라 투자하고 미국 파트너와 신뢰를 쌓아 예측 능력을 국제 자본으로 환전한다'],
  A14:['블랙 먼데이 사냥','허준수·그레이·월가 투자자','뉴욕 증권가·리버마운틴','시장 붕괴를 앞서 포지션으로 바꾸고 큰 수익을 거두지만 타인의 손실을 먹는 윤리 비용을 남긴다'],
  A15:['돈으로 산 정치의 문','허준수·허상도·정치인','서울·대산·정치권','금융 수익을 정치 정보와 가족 보호에 투입해 국가 권력과 거래할 첫 통로를 만든다'],
  A16:['마산 299표의 밑그림','허준수·강철중·김영준','마산·선거 조직','강철중을 정치판에 세우고 선거 조직과 지역 민심을 설계해 가족 인물을 공적 권력으로 올린다'],
  A17:['불곰 사업의 시동','허준수·허상도·소련 관계자','소련·대산 그룹','소련 붕괴를 앞두고 자원·기술 거래를 준비해 미래지식을 국가 간 사업으로 키운다'],
  A18:['AOL 투자와 절권도 입문','허준수·그레이·테드 윙','미국 투자사·무술관','AOL·타임워너를 선점하는 한편 몸으로 배우는 절권도에 입문해 지식 외 능력 축을 연다'],
  A19:['5공 청문회와 허상도의 증언','허준수·허상도·강철중·장세중','국회 청문회','허상도가 비자금과 자기 죄를 공개해 가족 속죄가 국가적 양심선언으로 바뀐다'],
  B01:['천억 환수와 천일의 복수','허준수·허상도·김 실장·정치권','국회·교도소·대산가','천억 원을 국고에 돌리지만 사면 약속이 깨져 준수가 장기 정치 보복과 가족 재편을 시작한다'],
  B02:['아버지를 꺼내는 정치 거래','허준수·김영준·허상도','서울 정치권·교도소','사면과 합당의 이해를 맞물려 아버지의 속죄를 가족 복권과 정치 영향력으로 환전한다'],
  B03:['소련 붕괴의 기술 쇼핑','허준수·러시아 기술자·대산 임원','소련·연구소·대산','붕괴하는 국가의 기술과 인재를 사들여 대산의 제조·과학 능력을 단숨에 끌어올린다'],
  B04:['반도체와 전자의 선점','허준수·허상도·전자 임원','대산전자·미국·일본','미래 전자 수요를 반도체·제품 투자로 바꾸며 대산의 업종과 인재 지도를 재편한다'],
  B05:['가족 기업의 합법화','허준수·허상도·대산 임원','대산 그룹·서울','사채의 흔적을 지우고 계열사·지분·경영 규칙을 정리해 가족 권력을 기업 권한으로 바꾼다'],
  B06:['국제 자본의 이름 리버마운틴','허준수·그레이·미국 투자자','뉴욕·리버마운틴','미국 투자회사를 독립 축으로 키워 한국 가족기업과 다른 국제 신뢰·자본 통화를 확보한다'],
  B07:['걸프전과 원유의 시간표','허준수·그레이·중동 관계자','미국·중동·금융시장','전쟁과 유가의 방향을 읽어 포지션을 잡되 국가 비극을 수익화하는 비용을 드러낸다'],
  B08:['정치 스타 강철중','허준수·강철중·김영준','국회·마산·서울','선거와 청문회에서 증명된 강철중을 지역 정치인이 아닌 전국 권력 후보로 끌어올린다'],
  B09:['마산 299표와 불곰 결산','허준수·강철중·허상도·러시아 인사','마산·서울·러시아','정치 표와 러시아 거래를 함께 결산해 가족·기업·국가 인정이 한 축으로 합쳐진다'],
  B10:['대산의 생활가전 전쟁','허준수·허상도·가전 임원','대산전자·가정','생활 불편을 제품 아이디어로 바꾸고 경쟁사보다 먼저 가전을 내놓아 소비자 인정을 얻는다'],
  B11:['LA 폭동의 방어선','허준수·스칼릿·그레이·교민','로스앤젤레스·코리아타운','미래 기억으로 폭동을 대비해 가족·교민·사업장을 지키며 자본가의 능력을 공동체 보호로 환전한다'],
  B12:['검은 수요일 십억 달러','허준수·그레이·영국 금융가','런던·뉴욕 금융시장','파운드 위기를 정확히 공략해 100억 달러를 얻고 세계 금융가의 경계와 인정을 동시에 산다'],
  B13:['스칼릿과 동업하는 사랑','허준수·스칼릿·그레이','미국 저택·리버마운틴','연인의 감정과 능력을 업무 파트너십으로 바꾸며 관계 보상을 기업 운영의 힘으로 만든다'],
  B14:['제품이 된 생활 기억','허준수·허상도·대산 연구진','대산 연구소·가정','회귀 전 생활 지식을 구체 제품 규격과 생산 일정으로 바꿔 발명형 보상을 지급한다'],
  B15:['삼풍의 징후와 구조 선택','허준수·건설 관계자·가족','서울 건물·대산','미래 재난 정보를 돈벌이보다 구조와 책임의 문제로 다뤄 사회적 인정의 값을 시험한다'],
  B16:['정보통신 민영화의 문','허준수·정부 인사·대산 임원','청와대·통신 사업장','통신의 미래를 읽고 민영화·사업권을 선점해 대산을 국가 인프라 기업으로 확장한다'],
  B17:['김장독 반간계','허준수·스칼릿·대산전자·진성','대산전자·경쟁사','가짜 도면을 흘려 경쟁사를 잘못된 제품에 묶고 김치냉장고의 실제 시장을 선점한다'],
  B18:['천재 연인의 비서 계약','허준수·스칼릿·테드 윙','미국·대산','스칼릿의 질투와 독립 욕망을 비서·동료 계약으로 바꾸며 준수가 협상에서 지는 변주를 만든다'],
  B19:['이철근 현행범과 대산의 공개사과','허준수·누나·이철근·황말자·허상도','호텔·경찰서·대산','누나를 해친 이철근을 법과 심리로 체포하고 대산이 먼저 치부를 공개해 가족 복수를 조직 정화로 바꾼다'],
  C01:['이철근 추가 응징과 김장독 출시','허준수·허상도·이철근·대산전자','교도소·대산전자','남은 응징을 닫고 김치냉장고를 시장에 내놓아 가족 정의와 제품 보상을 함께 결산한다'],
  C02:['통신·전자 제국의 확장','허준수·허상도·통신·전자 임원','대산 그룹·한국 시장','민영화와 전자 제품 선점을 연결해 대산의 산업 지위를 재벌급으로 끌어올린다'],
  C03:['미국 기술기업의 씨앗','허준수·그레이·미국 창업자','실리콘밸리·리버마운틴','미래 기술기업과 사람을 먼저 골라 지분을 얻고 국제 기업 생태계의 설계자가 된다'],
  C04:['동유럽·러시아의 붕괴 자산','허준수·러시아 인사·대산 임원','러시아·동유럽·대산','국가 붕괴의 자원·기술·부채를 사업으로 전환하며 정치 위험까지 떠안는다'],
  C05:['제약으로 산 생명과 신뢰','허준수·전갑수·제약 연구진','대산제약·병원','치료제와 연구 투자를 기업 수익뿐 아니라 환자 생존과 사회적 신뢰로 환전한다'],
  C06:['KPad와 모바일 미래','허준수·스티브·전자 연구진','애플·대산전자·미국','단말·운영체제·콘텐츠를 묶는 KPad를 앞세워 미래 컴퓨팅 시장을 선점한다'],
  C07:['애플을 향한 적대적 인수','허준수·스티브·애플 이사회','미국 증시·애플 본사','제품 통찰과 금융력을 결합해 애플 지배권을 노리며 기술 능력을 기업 권력으로 바꾼다'],
  C08:['금융위기 전의 현금 성벽','허준수·그레이·허상도','뉴욕·서울·대산','다가올 아시아 위기에 대비해 지분·현금·파생 포지션을 정리하고 선택지 비용을 선지불한다'],
  C09:['한국 식품과 문화의 수출','허준수·스칼릿·대산 임원','한국·미국 시장','음식·콘텐츠·유통을 세계 시장용 제품으로 바꾸며 가족 생활기술을 기업 자산으로 만든다'],
  C10:['아시아 외환위기의 전조','허준수·그레이·한국 정부 인사','아시아 금융시장·청와대','통화와 국가 신용의 붕괴를 예측해 대규모 포지션과 국가 개입의 윤리 문제를 연다'],
  C11:['대산의 세계 기업 전환','허준수·허상도·대산 사장단','대산 그룹·해외 지사','여러 선점 사업을 지배구조와 사람 배치로 결속해 한 가족기업을 세계 기업군으로 만든다'],
  C12:['중국 인터넷의 문','허준수·마윈·중국 사업가','중국·차이나 옐로 페이지','중국 인터넷 성장의 입구를 찾고 현지 창업자의 자율과 지분 사이 거래를 시작한다'],
  C13:['마윈을 선택한 저울','허준수·마윈·장가이','중국 회사·회의실','선악 판별과 사람 보는 눈으로 마윈에게 거액을 걸며 중국 사업의 핵심 파트너를 정한다'],
  C14:['알리바바 계약 전야','허준수·마윈·중국 관계자','중국·알리바바 사무실','지분·경영권·상장·물류 조건을 조정해 단순 투자를 장기 동업 계약으로 바꾼다'],
  C15:['알리바바 지분과 물류의 입구','허준수·마윈·장가이','중국·알리바바·물류 현장','49% 투자와 창업자 자율을 맞바꾸고 결제·배송·창고라는 다음 확장 과제를 연다'],
  D01:['알리바바와 중국 물류의 선점','허준수·마윈·장가이','중국·알리바바·물류회사','알리바바 지분·결제·배송·물류를 묶고 경영 불간섭을 대가로 중국 전자상거래 교두보를 굳힌다'],
  D02:['큐브의 검색·영상 생태계','허준수·세르게이 브린·큐브 인력','미국·큐브','브린을 큐브 대표로 세우고 지도·AI·자율주행·마이튜브를 하나의 플랫폼 비전으로 묶는다'],
  D03:['결혼 명령과 공중보건·가수의 씨앗','허준수·스칼릿·허상도·전태성·전갑수','대산가·제약사·홍대','연내 결혼을 받아들이면서 호흡기 연구와 전태성의 가수 꿈을 동시에 새 가족·사업 과제로 만든다'],
  D04:['대산엔터테인먼트와 가족의 비교 상처','허준수·전태성·스칼릿·허상도','홍대·대산엔터·가족 저택','골드리치를 창단하고 태성의 실력을 인정하며 천재 비교가 남긴 친구·부자 상처를 계약과 고백으로 푼다'],
  D05:['비밀 결혼과 모계 화해','허준수·스칼릿·차보희·차광철·가족','결혼식장·대산가','비밀 결혼식에서 생모와 외가의 과거를 대면해 법·돈이 아닌 가족 호칭과 동행을 보상으로 얻는다'],
  D06:['미국 콘텐츠 제국과 아프리카 진입','허준수·스칼릿·그레이·장우혁','미국·남아공·에티오피아','마이튜브·넷플릭스·마블의 입구를 열고 약·농업·자원권을 묶어 아프리카 경제권에 진입한다'],
  D07:['식품·출판·히어로·임신의 복합 확장','허준수·스칼릿·조앤 롤링·마블·DC·김 여사','미국 저택·출판사·만화회사·대산푸드','가족의 만두와 임신을 지키면서 해리포터·마블·DC·애플을 선점해 생활·콘텐츠·기술 보상을 교차한다'],
  D08:['아프리카 자원망과 한국 위기 포지션','허준수·장우혁·아프리카 지도자·허상도','탄자니아·모잠비크·한국 금융시장','광산·가스·철도·항만·학교·경비를 구축하면서 한국 외환위기 수익을 국가 재건 자금으로 바꿀 판을 짠다'],
  D09:['일본·IMF·미국을 묶은 국가 협상','허준수·한국 대통령·IMF 총재·클린턴·소로스','청와대·IMF·백악관','일본의 손실과 희토류·가스를 지렛대로 IMF 시간표와 한국군 파병·미국 승인을 한꺼번에 얻는다'],
  D10:['희토류 안보와 르완다 거점','허준수·클린턴·르완다 대통령·한국 대통령','백악관·르완다·청와대','미군 한 명의 상징과 르완다 병력·산업단지를 묶어 아프리카 자원을 지킬 합법 거점을 만든다'],
  D11:['탄자니아 배신과 르완다 병력 선점','허준수·탄자니아 대통령·르완다 대통령·허상도','탄자니아·르완다·대산','중국에 흔들린 탄자니아가 학교 폐쇄를 요구하자 뇌물로 시간을 사고 르완다 병력과 애플 공장 발표를 선점한다'],
  D12:['학생 항쟁·쿠데타·새 질서','허준수·장우혁·학생·야당 지도자·치안국장','탄자니아 수도·자원개발사 요새','학교 폐쇄를 공개해 학생 항쟁을 촉발하고 쿠데타 경찰을 체포해 새 정부·교육기금·파병 헌법을 얻는다'],
  D13:['평화 배당의 산업화와 사우디 진입','허준수·르완다 지도부·반군·허상도','르완다·탄자니아 남부·사우디 공항','반군을 분열시키는 동안 르완다 제약·감염병 산업을 세우고 그 성과를 들고 사우디 왕궁으로 간다'],
  D14:['사우디 가스·담수화 패키지','허준수·압둘라 섭정·사우디 관료','리야드 왕궁·담수화 시설','가스·저유가·아람코·고용을 엮어 모잠비크 가스 판로와 담수화 100곳 계약을 얻는다'],
  D15:['사우디 왕가의 미래와 콩고 자본','허준수·살만·무함마드 빈 살만·장우혁','사우디 왕자 저택·콩고·서사하라','셰일·콩고 자원·태양광·언론·후계 구도를 가르쳐 왕가의 개인자금과 장기 사업권을 얻는다'],
  D16:['사하라 구상과 중국의 포위 반격','허준수·모로코 국왕·중국 정부·쿠르드 민병대','모로코·사하라·르완다·콩고','희토류 줄타기와 쿠르드 이동을 실행하고 사막 매각을 요구하자 중국이 반군을 지원하는 포위전이 열린다'],
};

const arcHeader = ['arc_id','arc_name','start_sequence','end_sequence','start_label','end_label','episode_count','main_characters','main_locations','concrete_premise','central_question','promise','pressure_escalation','mid_turn','concrete_payoff','relationship_change','status_or_ability_change','residual_cost','next_arc_bridge','boundary_signals','confidence'];
const arcRows = [];
for (const [index, rawId] of rawArcIds.entries()) {
  const rows = chapterTables.flatMap((table) => table.slice(1)).filter((row) => row[ch.arc_id] === rawId);
  const start = Number(rows[0][ch.sequence]);
  const end = Number(rows.at(-1)[ch.sequence]);
  const summary = summaries[rawId] ?? [`${rawId} 사건 묶음`,'허준수와 해당 회차 인물','해당 회차의 주요 장소',rows[0][ch.action]];
  const mapped = remap.get(rawId);
  arcRows.push([
    mapped, summary[0], start, end, rows[0][ch.visible_label], rows.at(-1)[ch.visible_label], end - start + 1,
    summary[1], summary[2], summary[3],
    `${summary[0]}에서 허준수의 능력은 누구의 인정과 어떤 권한으로 환전되는가?`,
    `${rows[0][ch.reader_promise]}에서 시작해 ${rows.at(-1)[ch.paid_reward]}까지 실제 지급한다.`,
    `${rows[Math.floor((rows.length - 1) * 0.35)][ch.resistance_or_cost]} 뒤 ${rows[Math.floor((rows.length - 1) * 0.65)][ch.turn_or_reveal]}가 압력을 높인다.`,
    rows[Math.floor((rows.length - 1) / 2)][ch.turn_or_reveal],
    rows.at(-1)[ch.paid_reward],
    `${rows[0][ch.entry_state]}에서 ${rows.at(-1)[ch.state_change]}로 관계 위치가 바뀐다.`,
    `${rows.map((row) => row[ch.state_change_axis]).filter(Boolean).slice(0, 3).join('·')} 축에서 ${rows.at(-1)[ch.state_change]}`,
    `${rows.map((row) => row[ch.resistance_or_cost]).filter(Boolean).slice(-2).join(' / ')}가 완전히 지워지지 않는다.`,
    rows.at(-1)[ch.ending_hook],
    `시작 ${rows[0][ch.entry_state]} / 중간 ${rows[Math.floor((rows.length - 1) / 2)][ch.turn_or_reveal]} / 종료 ${rows.at(-1)[ch.ending_hook]}`,
    'high',
  ]);
}
fs.writeFileSync(path.join(outDir, 'arc_map.csv'), encode([arcHeader, ...arcRows]));
fs.writeFileSync(path.join(outDir, '.arc_remap.json'), `${JSON.stringify(Object.fromEntries(remap), null, 2)}\n`);
