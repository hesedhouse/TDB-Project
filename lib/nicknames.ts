const ADJECTIVES = [
  '귀여운', '멋진', '빛나는', '달콤한', '시원한', '따뜻한',
  '신비로운', '활발한', '조용한', '밝은', '어두운', '부드러운',
  '강한', '빠른', '느린', '높은', '낮은', '넓은', '좁은',
]

const NOUNS = [
  '고양이', '강아지', '토끼', '펭귄', '곰', '로봇',
  '별', '달', '해', '구름', '바람', '비', '눈',
  '꽃', '나무', '바다', '산', '강', '별빛', '달빛',
  '커피', '차', '케이크', '쿠키', '아이스크림', '초콜릿',
]

export function generateRandomNickname(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)]
  return `${adjective}${noun}`
}
