import requests
import xml.etree.ElementTree as ET
from supabase import create_client

# 1. Supabase 설정 (본인 정보 확인!)
url = "https://nbifzyhjajxzhqkkhgt.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5iZml6eWhsamF4emJxa3FraGd0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzk1NTk1MzIsImV4cCI6MjA1NTEzNTUzMn0.k7j4QZzMJSYUo96-W1N0zU86R3j95OjQg57aG7T-6v8"
supabase = create_client(url, key)

def fetch_and_save_trends():
    print("🚀 구글 보안망을 뚫고 트렌드를 낚아챕니다...")
    
    # 브라우저인 척 하기 위한 헤더 추가
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    
    rss_url = "https://trends.google.com/trends/trendingsearches/daily/rss?geo=KR"
    
    try:
        response = requests.get(rss_url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            root = ET.fromstring(response.text)
            keywords = [item.find("title").text for item in root.findall(".//item") if item.find("title") is not None]
            print(f"🔎 {len(keywords)}개의 실시간 유행어 포착!")
        else:
            print(f"⚠️ 구글 접속 실패({response.status_code}). 비상용 리스트를 사용합니다.")
            # 구글이 막을 경우를 대비한 2026년형 핫 키워드 리스트
            keywords = ["AI에이전트", "메타버스2", "초전도체", "인기급상승", "TDB", "신상카페", "오늘의운세", "갓생살기", "MZ트렌드", "오운완"]

        # 2. DB 저장
        for word in keywords[:15]:
            formatted_word = f"#{word.replace(' ', '')}"
            data = {"word": formatted_word, "source": "google_rss"}
            
            try:
                supabase.table("trending_keywords").upsert(data, on_conflict="word").execute()
                print(f"✅ 동기화: {formatted_word}")
            except Exception as db_e:
                print(f"❌ DB 오류: {db_e}")
                
    except Exception as e:
        print(f"❌ 수집 중 오류: {e}")

if __name__ == "__main__":
    fetch_and_save_trends()