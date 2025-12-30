/**
 * App.js - 메인 애플리케이션 스크립트
 * 리스팅 폼 제출을 처리하고 백엔드 어댑터를 통해 데이터를 전송합니다.
 */

import { createListing, uploadImage, LISTING_PAYLOAD_SCHEMA } from './services/backendAdapter.js';
import { useAuth } from './hooks/useAuth.js';

// 리스팅 폼 선택자 (data-listing-form 속성을 가진 요소)
const LISTING_FORM_SELECTOR = '[data-listing-form]';

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector(LISTING_FORM_SELECTOR);

  if (!form) {
    console.info('[Adapter] Listing form not found. Adapter is idle but ready.');
    return;
  }

  // 폼 제출 이벤트 리스너
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    // 이미지 처리
    const images = await handleImages(formData.getAll('images'));
    // 사용자 정보 가져오기
    const { user } = useAuth();

    // 페이로드 빌드
    const payload = buildListingPayload(formData, images, user);
    console.log('[Adapter] Listing payload (contract):', payload);

    try {
      const response = await createListing(payload);
      console.log('[Adapter] Backend response:', response);
    } catch (error) {
      console.error('[Adapter] Failed to create listing:', error);
    }
  });
});

/**
 * 폼 데이터를 기반으로 리스팅 페이로드를 빌드합니다.
 * @param {FormData} formData - 폼 데이터
 * @param {Array<string>} images - 업로드된 이미지 URL 배열
 * @param {Object} user - 사용자 객체
 * @returns {Object} 리스팅 페이로드
 */
function buildListingPayload(formData, images, user) {
  return {
    ...LISTING_PAYLOAD_SCHEMA,
    title: formData.get('title') || '',
    description: formData.get('description') || '',
    price: parseNumber(formData.get('price')),
    currency: formData.get('currency') || LISTING_PAYLOAD_SCHEMA.currency,
    location: {
      address: formData.get('address') || '',
      city: formData.get('city') || '',
      district: formData.get('district') || '',
      latitude: parseNumber(formData.get('latitude')),
      longitude: parseNumber(formData.get('longitude'))
    },
    propertyType: formData.get('propertyType') || '',
    images,
    contact: {
      name: formData.get('contactName') || '',
      phone: formData.get('contactPhone') || '',
      email: formData.get('contactEmail') || ''
    },
    metadata: {
      source: 'web-form',
      submittedAt: new Date().toISOString(),
      userId: user?.id || null
    }
  };
}

/**
 * 이미지 파일들을 업로드하고 URL 배열을 반환합니다.
 * @param {Array<File>} files - 파일 배열
 * @returns {Promise<Array<string>>} 업로드된 이미지 URL 배열
 */
async function handleImages(files) {
  const uploads = [];
  for (const file of files || []) {
    if (!file || (file instanceof File && file.size === 0)) continue;
    const result = await uploadImage(file);
    if (result?.url) uploads.push(result.url);
  }
  return uploads;
}

/**
 * 문자열을 숫자로 파싱합니다. 유효하지 않으면 null 반환.
 * @param {string} value - 파싱할 값
 * @returns {number|null} 파싱된 숫자 또는 null
 */
function parseNumber(value) {
  const numberValue = value !== null && value !== undefined && value !== '' ? Number(value) : null;
  return Number.isFinite(numberValue) ? numberValue : null;
}
