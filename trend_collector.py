import requests
import xml.etree.ElementTree as ET
from supabase import create_client

# 1. Supabase 설정 (열쇠와 주소는 아까 성공한 그대로!)
url = "https://nkicvcmctysrewwherak.supabase.co".strip()
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5raWN2Y21jdHlzcmV3d2hlcmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4Nzk2NzYsImV4cCI6MjA4NjQ1NTY3Nn0.HQKJsOcwGWnpySjERv4JwIge2r5R2_GoJVBN2Iq52xk".strip()
supabase = create_client(url, key)

def fetch_realtime_trends():
    print("🚀 실시간 트렌드 사냥을 시작합니다...")
    
    # 브라우저인 척 위장하기 위한 헤더
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    }

    # 수집할 소스 리스트 (구글 뉴스 트렌드가 구글 검색보다 수집이 더 안정적입니다)
    sources = [
        {"name": "google_news", "url": "https://news.google.com/rss/topics/CAAqI0gKIhtDQkFTRHdvSkwyMHZNRzV6TVd4MUVnSnVieWdhcVNoR2V3b0pLAA?hl=ko&gl=KR&ceid=KR:ko"},
        # 추가로 유튜브 트렌드 등을 RSS 형태로 제공하는 곳이 있다면 여기에 추가 가능합니다.
    ]

    final_keywords = []

    for src in sources:
        try:
            response = requests.get(src["url"], headers=headers, timeout=10)
            if response.status_code == 200:
                root = ET.fromstring(response.text)
                # 뉴스 제목에서 핵심 키워드만 추출 (상위 15개)
                for item in root.findall(".//item")[:15]:
                    title = item.find("title").text
                    # 제목이 너무 길면 첫 단어 위주로 핵심만 추출
                    keyword = title.split('-')[0].split(':')[0].strip().split(' ')[0]
                    if len(keyword) > 1: # 한 글자 제외
                        final_keywords.append(keyword)
                print(f"✅ {src['name']} 수집 완료!")
        except Exception as e:
            print(f"⚠️ {src['name']} 수집 중 오류: {e}")

    # 중복 제거 및 저장
    unique_keywords = list(set(final_keywords))
    
    for word in unique_keywords:
        formatted_word = f"#{word}"
        data = {"word": formatted_word, "source": "realtime_news"}
        
        try:
            supabase.table("trending_keywords").upsert(data, on_conflict="word").execute()
            print(f"🔥 DB 동기화 완료: {formatted_word}")
        except Exception as db_e:
            print(f"❌ DB 오류: {db_e}")

if __name__ == "__main__":
    fetch_realtime_trends()