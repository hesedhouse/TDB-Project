import { NextResponse } from 'next/server'

/** 서버 시간(Unix ms). 동시 시청(Watch Together) 싱크용. */
export async function GET() {
  return NextResponse.json({ serverTime: Date.now() })
}
