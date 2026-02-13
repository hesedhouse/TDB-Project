#!/usr/bin/env python3
"""
한국 구글 트렌드 인기 키워드 10개 수집.
출력: JSON 배열 한 줄 (stdout)
사용: pip install pytrends && python scripts/fetch_trends.py
"""
import json
import sys

def main():
    try:
        from pytrends.request import TrendReq
    except ImportError:
        print(json.dumps([
            "애교챌린지", "삼각김밥 꿀조합", "2026 월드컵", "올겨울 히트곡",
            "재택카페", "요즘 대세 드라마", "맛있는 라면", "겨울 스포츠",
            "새해 다짐", "인생 사진"
        ], ensure_ascii=False), file=sys.stderr)
        print("Fallback: pytrends not installed. pip install pytrends", file=sys.stderr)
        sys.exit(0)

    try:
        pytrends = TrendReq(hl='ko-KR', tz=540)  # 한국어, KST
        # pn: 지역 코드. south_korea 또는 korea
        df = pytrends.trending_searches(pn='south_korea')
        if df is not None and not df.empty:
            col = df.columns[0]
            keywords = df[col].astype(str).str.strip().head(10).tolist()
        else:
            keywords = []
    except Exception as e:
        print(f"pytrends error: {e}", file=sys.stderr)
        keywords = [
            "애교챌린지", "삼각김밥 꿀조합", "2026 월드컵", "올겨울 히트곡",
            "재택카페", "요즘 대세 드라마", "맛있는 라면", "겨울 스포츠",
            "새해 다짐", "인생 사진"
        ]

    if len(keywords) < 10:
        fallback = [
            "애교챌린지", "삼각김밥 꿀조합", "2026 월드컵", "올겨울 히트곡",
            "재택카페", "요즘 대세 드라마", "맛있는 라면", "겨울 스포츠",
            "새해 다짐", "인생 사진"
        ]
        for w in fallback:
            if w not in keywords:
                keywords.append(w)
            if len(keywords) >= 10:
                break
        keywords = keywords[:10]

    print(json.dumps(keywords[:10], ensure_ascii=False))

if __name__ == "__main__":
    main()
