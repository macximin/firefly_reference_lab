import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const workDir = dirname(fileURLToPath(import.meta.url));
const files = ["early_arcs.json", "middle_arcs.json", "late_arcs.json"];
const arcs = files.flatMap((filename) => JSON.parse(readFileSync(join(workDir, filename), "utf8")));

for (const arc of arcs) {
  if (arc.start_sequence === 75) {
    arc.boundary_signals = [
      "74화에서 3조 5천억 연합대출과 대현전자 방어전이 전면화되고 조갑수가 조현경 혼인 카드를 꺼냄",
      "75화에서 마이크로소프트 수익 4조가 숫자로 확정되어 자금 조달 약속이 실물 보상으로 전환됨",
      "주요 관계가 조갑수의 지원자 관계에서 대현전자 경영권을 다투는 독립 경쟁자로 바뀜",
    ];
    arc.confidence = "medium-high";
    arc.concrete_premise = "3조 5천억 연합대출과 마이크로소프트 2조 원 투자 성과를 실탄으로 삼아 조갑수에게 대현전자 경쟁을 선포한다.";
  }
  if (arc.start_sequence === 219) {
    arc.promise = "상업성 있는 최초 스마트폰, 애플 적대적 인수 선언·진행, 연금 2120→2500년, 7광구 여덟 번째 성공, 바뀐 북한 미래가 차례로 제시된다.";
    arc.residual_cost = "애플 적대적 인수는 곧 완료된다는 진행 보고만 있고 최종 소유권 이전은 확인되지 않는다. 서한만 개발도 2014년 이후 과제로 남고 북방사업·북한 체제·러시아 위험은 열린 미래다.";
  }
}

writeFileSync(join(workDir, "arc_definitions.json"), `${JSON.stringify(arcs, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ count: arcs.length, start: arcs[0].start_sequence, end: arcs.at(-1).end_sequence }, null, 2));
