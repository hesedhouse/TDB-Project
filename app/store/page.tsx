'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { getHourglasses, setHourglasses } from '@/lib/hourglass'
import { requestPayment } from '@portone/browser-sdk/v2'
import { PaymentCurrency, PaymentPayMethod } from '@portone/browser-sdk/v2'

const PRICE_PER_ONE = 120
const PRESET_OPTIONS = [1, 10, 100, 1000, 10000]

// 포트원 V2 (토스페이먼츠 테스트). .env로 덮어쓸 수 있음.
const STORE_ID =
  process.env.NEXT_PUBLIC_PORTONE_STORE_ID ?? 'store-c88c91a8-6c3c-4df1-a69c-6b08e7169521'
const CHANNEL_KEY =
  process.env.NEXT_PUBLIC_PORTONE_CHANNEL_KEY ?? 'channel-key-5d85fadf-b4c1-4ead-a5b9-aae3f2fe1a6f'

export default function StorePage() {
  const router = useRouter()
  const [hourglasses, setHourglassesState] = useState(0)
  const [customQty, setCustomQty] = useState<string>('')
  const [toast, setToast] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    setHourglassesState(getHourglasses())
  }, [])

  const customNum = Math.max(0, Math.floor(Number(customQty) || 0))
  const customTotal = customNum * PRICE_PER_ONE

  const handlePurchase = async (qty: number) => {
    if (qty < 1 || processing) return
    if (!STORE_ID || !CHANNEL_KEY) {
      setToast('결제 설정이 없습니다. 상점 ID와 채널 키를 확인해 주세요.')
      return
    }
    const totalAmount = qty * PRICE_PER_ONE
    setProcessing(true)
    setToast('결제창을 여는 중...')
    try {
      const response = await requestPayment({
        storeId: STORE_ID,
        channelKey: CHANNEL_KEY,
        paymentId: `tdb-${Date.now()}-${crypto.randomUUID()}`,
        orderName: `모래시계 ${qty}개`,
        totalAmount,
        currency: PaymentCurrency.KRW,
        payMethod: PaymentPayMethod.CARD,
      })
      if (response?.code != null) {
        setToast(response.message ?? '결제에 실패했어요. 다시 시도해 주세요.')
        return
      }
      const next = getHourglasses() + qty
      setHourglasses(next)
      setHourglassesState(next)
      setCustomQty('')
      setToast('결제가 완료되었습니다! 모래시계가 충전되었습니다.')
      setTimeout(() => router.push('/'), 1800)
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : '결제 중 오류가 발생했어요. 결제를 취소하셨거나 네트워크를 확인해 주세요.'
      setToast(msg)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="min-h-screen bg-midnight-black text-white pb-20 safe-bottom">
      <header className="sticky top-0 z-10 glass-strong border-b border-amber-500/20 safe-top">
        <div className="flex items-center justify-between px-4 py-4">
          <Link
            href="/"
            className="text-gray-400 hover:text-white text-sm sm:text-base flex-shrink-0"
          >
            ← 홈으로
          </Link>
          <h1 className="text-lg sm:text-xl font-bold text-amber-400">모래시계 충전소</h1>
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-amber-500/20"
            role="status"
            aria-label={`보유 모래시계 ${hourglasses}개`}
          >
            <span className="text-lg sm:text-xl leading-none" aria-hidden>⏳</span>
            <span className="font-semibold text-sm sm:text-base tabular-nums text-white">
              {hourglasses}
            </span>
          </div>
        </div>
      </header>

      <main className="px-4 py-6 sm:py-8 max-w-2xl mx-auto">
        <p className="text-gray-400 text-sm text-center mb-8">
          모래시계로 방 수명을 연장할 수 있어요. (1개 = 1시간 연장)
        </p>

        {/* 프리셋 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-8">
          {PRESET_OPTIONS.map((qty) => {
            const total = qty * PRICE_PER_ONE
            return (
              <motion.div
                key={qty}
                className="rounded-2xl border border-amber-500/30 bg-white/[0.04] p-4 sm:p-5 flex flex-col"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <span className="text-2xl" aria-hidden>⏳</span>
                  <span className="font-bold text-lg text-white">× {qty}</span>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-amber-400 mb-4">
                  {total.toLocaleString()}원
                </p>
                <motion.button
                  type="button"
                  onClick={() => handlePurchase(qty)}
                  disabled={processing}
                  className="mt-auto w-full py-2.5 rounded-xl font-semibold bg-amber-500/20 text-amber-400 border border-amber-400/40 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  구매하기
                </motion.button>
              </motion.div>
            )
          })}
        </div>

        {/* 직접 입력 */}
        <div className="rounded-2xl border border-amber-500/30 bg-white/[0.04] p-5 sm:p-6">
          <h2 className="text-base font-semibold text-amber-400/90 mb-4">직접 입력</h2>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-end">
            <div className="flex-1">
              <label htmlFor="custom-qty" className="block text-xs text-gray-400 mb-1">
                수량
              </label>
              <input
                id="custom-qty"
                type="number"
                min={0}
                max={999999}
                value={customQty}
                onChange={(e) => setCustomQty(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl bg-black/30 border border-amber-500/30 text-white placeholder-gray-500 focus:border-amber-400 focus:outline-none text-lg tabular-nums"
              />
            </div>
            <div className="sm:w-40">
              <p className="text-xs text-gray-400 mb-1">결제 금액</p>
              <p className="text-xl sm:text-2xl font-bold text-amber-400 tabular-nums">
                {customTotal.toLocaleString()}원
              </p>
            </div>
            <motion.button
              type="button"
              onClick={() => handlePurchase(customNum)}
              disabled={customNum < 1 || processing}
              className="py-3 px-6 rounded-xl font-semibold bg-amber-500/20 text-amber-400 border border-amber-400/40 hover:bg-amber-500/30 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              구매하기
            </motion.button>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {toast && (
          <motion.div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 glass-strong px-5 py-3 rounded-2xl text-amber-400 font-semibold text-center border border-amber-400/40 safe-bottom"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            transition={{ duration: 0.2 }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
