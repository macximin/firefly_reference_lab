from __future__ import annotations

import json
import re
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from lxml import html


WORK_DIR = Path("/Users/a2501/Desktop/firefly_studio/edge_repos/firefly_reference_lab/.work/market_collection")
OLD_SAMPLE = WORK_DIR / "platform-sample-100.json"
RANKING_OUTPUT = WORK_DIR / "male-200-naver-ranking-snapshot.json"
DETAIL_OUTPUT = WORK_DIR / "male-200-naver-details.json"
BASE = "https://series.naver.com"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 Chrome/139 Safari/537.36"
)
GENRES = {"202": "판타지", "208": "현판", "206": "무협"}


def clean(value: str | None) -> str:
    return " ".join((value or "").replace("\xa0", " ").split())


def fetch(url: str, attempts: int = 3) -> bytes:
    error: Exception | None = None
    for attempt in range(attempts):
        try:
            request = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=25) as response:
                return response.read()
        except Exception as exc:  # bounded retry; final error is retained per row
            error = exc
            if attempt + 1 < attempts:
                time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"fetch failed: {url}: {error}")


def parse_ranking_page(category_code: str, page: int) -> list[dict]:
    query = urlencode(
        {
            "rankingTypeCode": "DAILY",
            "categoryCode": category_code,
            "page": page,
        }
    )
    url = f"{BASE}/novel/top100List.series?{query}"
    root = html.fromstring(fetch(url))
    rows: list[dict] = []
    for item in root.xpath('//*[@id="content"]//li'):
        rank_text = clean(
            "".join(
                item.xpath(
                    './div[contains(@class,"top_numb")]'
                    '//span[contains(@class,"top_num")]//text()'
                )
            )
        )
        title_links = item.xpath('.//h3/a[contains(@href,"detail.series")]')
        if not rank_text.isdigit() or not title_links:
            continue
        link = title_links[0]
        href = link.get("href") or ""
        match = re.search(r"productNo=(\d+)", href)
        if not match:
            continue
        info_text = clean("".join(item.xpath('.//p[contains(@class,"info")]//text()')))
        author = clean("".join(item.xpath('.//span[contains(@class,"author")]//text()')))
        score = clean("".join(item.xpath('.//em[contains(@class,"score_num")]//text()')))
        synopsis = clean("".join(item.xpath('.//p[contains(@class,"dsc")]//text()')))
        episode_match = re.search(r"총\s*([\d,]+)화/(완결|미완결)", info_text)
        rows.append(
            {
                "product_id": match.group(1),
                "rank": int(rank_text),
                "title": clean("".join(link.itertext())),
                "author": author,
                "rating": score,
                "episode_count": int(episode_match.group(1).replace(",", ""))
                if episode_match
                else None,
                "completion_state": episode_match.group(2) if episode_match else "",
                "ranking_synopsis": synopsis,
                "ranking_url": url,
            }
        )
    return rows


def collect_rankings() -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {}
    for category_code in ["ALL", *GENRES.keys()]:
        rows: list[dict] = []
        for page in range(1, 6):
            rows.extend(parse_ranking_page(category_code, page))
            time.sleep(0.12)
        if len(rows) != 100:
            raise RuntimeError(f"ranking rows != 100: {category_code}: {len(rows)}")
        result[category_code] = rows
    return result


def select_male_100(rankings: dict[str, list[dict]]) -> list[dict]:
    genre_maps = {
        code: {row["product_id"]: row for row in rows}
        for code, rows in rankings.items()
        if code in GENRES
    }

    def genre_for(product_id: str) -> tuple[str, int] | None:
        for code in ["206", "208", "202"]:
            row = genre_maps[code].get(product_id)
            if row:
                return GENRES[code], row["rank"]
        return None

    selected: list[dict] = []
    seen: set[str] = set()
    for row in rankings["ALL"]:
        genre_info = genre_for(row["product_id"])
        if not genre_info:
            continue
        genre, category_rank = genre_info
        selected.append(
            {
                **row,
                "genre": genre,
                "overall_rank": row["rank"],
                "category_rank": category_rank,
                "selection_source": "전체 일간 TOP100 남성향 필터",
            }
        )
        seen.add(row["product_id"])

    by_rank = {
        code: {row["rank"]: row for row in rows}
        for code, rows in rankings.items()
        if code in GENRES
    }
    for category_rank in range(1, 101):
        for code in ["202", "208", "206"]:
            row = by_rank[code].get(category_rank)
            if not row or row["product_id"] in seen:
                continue
            selected.append(
                {
                    **row,
                    "genre": GENRES[code],
                    "overall_rank": None,
                    "category_rank": category_rank,
                    "selection_source": "장르 일간 TOP100 보충",
                }
            )
            seen.add(row["product_id"])
            if len(selected) == 100:
                break
        if len(selected) == 100:
            break

    if len(selected) != 100 or len(seen) != 100:
        raise RuntimeError(f"selected rows invalid: {len(selected)} / {len(seen)}")
    for index, row in enumerate(selected, 1):
        row["selection_order"] = index
    return selected


def parse_detail(row: dict) -> dict:
    product_id = row["product_id"]
    url = f"{BASE}/novel/detail.series?productNo={product_id}"
    result = {
        **row,
        "platform": "네이버 시리즈",
        "ranking_surface": "웹소설 일간 TOP100 남성향 표본",
        "metric_type": "다운로드",
        "product_url": url,
        "detail_url": url,
        "synopsis_state": "pending",
    }
    try:
        root = html.fromstring(fetch(url))
        title = clean("".join(root.xpath('//*[@id="content"]//div[contains(@class,"end_head")]/h2//text()')))
        if title:
            result["title"] = title
        result["metric_display"] = clean(
            "".join(root.xpath('//*[@id="content"]//a[contains(@class,"btn_download")]/span//text()'))
        )
        result["comment_display"] = clean(
            "".join(root.xpath('//*[@id="commentCount"]//text()'))
        )
        detail_score = clean(
            "".join(root.xpath('//*[@id="content"]//div[contains(@class,"score_area")]/em//text()'))
        )
        if detail_score:
            result["rating"] = detail_score
        genre = clean(
            "".join(
                root.xpath(
                    '//*[@id="content"]//ul[contains(@class,"end_info")]'
                    '//a[contains(@href,"genreCode=")]//text()'
                )
            )
        )
        if genre:
            result["genre"] = genre
        info_items = root.xpath(
            '//*[@id="content"]//ul[contains(@class,"end_info")]//li[contains(@class,"info_lst")]/ul/li'
        )
        age_rating = ""
        for item in info_items:
            label = clean("".join(item.xpath('./span[1]//text()')))
            value = clean("".join(item.xpath('./a[1]//text()')))
            item_text = clean("".join(item.itertext()))
            if label == "글" and value:
                result["author"] = value
            elif label == "출판사" and value:
                result["publisher"] = value
            elif "이용가" in item_text:
                age_rating = item_text
        result["age_rating"] = age_rating
        synopsis = clean(
            "".join(
                root.xpath(
                    '//*[@id="content"]//div[contains(@class,"end_dsc")]'
                    '/div[contains(@class,"_synopsis")]//text()'
                )
            )
        )
        result["synopsis"] = synopsis or row.get("ranking_synopsis", "")
        result["synopsis_state"] = (
            "full_public_detail" if synopsis else "ranking_summary_fallback"
        )
        result["collection_state"] = "complete"
    except Exception as exc:
        result["metric_display"] = ""
        result["comment_display"] = ""
        result["publisher"] = ""
        result["age_rating"] = ""
        result["synopsis"] = row.get("ranking_synopsis", "")
        result["synopsis_state"] = (
            "ranking_summary_fallback" if result["synopsis"] else "restricted_or_unavailable"
        )
        result["collection_state"] = "error"
        result["error"] = str(exc)
    return result


def main() -> None:
    rankings = collect_rankings()
    selected = select_male_100(rankings)
    ranking_payload = {
        "collected_at": time.strftime("%Y-%m-%d %H:%M:%S KST"),
        "ranking_period": "DAILY",
        "ranking_url": f"{BASE}/novel/top100List.series",
        "category_codes": {"ALL": "전체", **GENRES},
        "selection_rule": (
            "전체 일간 TOP100의 판타지·현판·무협 84편을 우선하고, "
            "부족한 16편은 세 장르 일간 순위를 동일 순위 라운드로빈으로 보충"
        ),
        "rankings": rankings,
        "selected_male_100": selected,
    }
    RANKING_OUTPUT.write_text(json.dumps(ranking_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    old_payload = json.loads(OLD_SAMPLE.read_text(encoding="utf-8"))
    old_map = {
        str(row["product_id"]): row
        for row in old_payload["rows"]
        if row["platform"] == "네이버 시리즈"
    }
    final_by_id: dict[str, dict] = {}
    new_rows = [row for row in selected if row["product_id"] not in old_map]
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(parse_detail, row): row for row in new_rows}
        for future in as_completed(futures):
            detail = future.result()
            final_by_id[detail["product_id"]] = detail

    for row in selected:
        product_id = row["product_id"]
        if product_id in final_by_id:
            continue
        old = old_map[product_id]
        final_by_id[product_id] = {
            **old,
            **row,
            "product_id": product_id,
            "platform": "네이버 시리즈",
            "ranking_surface": "웹소설 일간 TOP100 남성향 표본",
            "metric_type": "다운로드",
            "detail_snapshot": old_payload["receipt"]["collected_at"],
            "collection_state": "reused_recent_detail",
        }

    final_rows = [final_by_id[row["product_id"]] for row in selected]
    DETAIL_OUTPUT.write_text(
        json.dumps(
            {
                "platform": "네이버 시리즈",
                "count": len(final_rows),
                "rows": final_rows,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "count": len(final_rows),
                "unique": len({row["product_id"] for row in final_rows}),
                "reused": len(final_rows) - len(new_rows),
                "new": len(new_rows),
                "genres": {
                    genre: sum(row["genre"] == genre for row in final_rows)
                    for genre in ["판타지", "현판", "무협"]
                },
                "synopsis_blank": sum(not row.get("synopsis") for row in final_rows),
                "metric_blank": sum(not row.get("metric_display") for row in final_rows),
                "errors": sum(row.get("collection_state") == "error" for row in final_rows),
                "ranking_output": str(RANKING_OUTPUT),
                "detail_output": str(DETAIL_OUTPUT),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
