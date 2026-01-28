/**
 * Translation helper for backend data
 * Translates Korean property data to English when needed
 */

(function () {
    'use strict';

    /**
     * Detect page language
     */
    function getPageLanguage() {
        return document.documentElement.lang || 'ko';
    }

    /**
     * Property type translations
     */
    const propertyTypeTranslations = {
        '아파트': 'Apartment',
        '사무실': 'Office',
        '상가': 'Commercial',
        '오피스텔': 'Officetel',
        '빌라': 'Villa',
        '주택': 'House',
        '토지': 'Land',
        '건물': 'Building'
    };

    /**
     * Transaction type translations
     */
    const transactionTypeTranslations = {
        '매매': 'Sale',
        '전세': 'Jeonse',
        '월세': 'Monthly Rent',
        '단기임대': 'Short-term Rent'
    };

    /**
     * Status translations
     */
    const statusTranslations = {
        '매물중': 'Available',
        '협의중': 'In Negotiation',
        '계약완료': 'Sold',
        '임대완료': 'Rented'
    };

    /**
     * Location translations (major areas)
     */
    const locationTranslations = {
        '잠실': 'Jamsil',
        '송파': 'Songpa',
        '강남': 'Gangnam',
        '서초': 'Seocho',
        '역삼': 'Yeoksam',
        '삼성': 'Samsung',
        '석촌': 'Seokchon',
        '신천': 'Sincheon'
    };

    /**
     * Generic text translations
     */
    const textTranslations = {
        '층': 'F',
        '평': 'pyeong',
        '방': 'room',
        '욕실': 'bath',
        '주차': 'parking',
        '엘리베이터': 'elevator',
        '신축': 'new construction',
        '리모델링': 'remodeled'
    };

    /**
     * Translate a property object
     * @param {Object} property - Property data from backend
     * @returns {Object} Translated property
     */
    function translateProperty(property) {
        const lang = getPageLanguage();
        if (lang === 'ko') return property;

        const translated = { ...property };

        // Translate property type
        if (translated.type) {
            translated.type = propertyTypeTranslations[translated.type] || translated.type;
        }

        // Translate transaction type
        if (translated.transaction_type) {
            translated.transaction_type = transactionTypeTranslations[translated.transaction_type] || translated.transaction_type;
        }

        // Translate status
        if (translated.status) {
            translated.status = statusTranslations[translated.status] || translated.status;
        }

        // Translate location
        if (translated.location) {
            Object.keys(locationTranslations).forEach(ko => {
                translated.location = translated.location.replace(ko, locationTranslations[ko]);
            });
        }

        // Translate address
        if (translated.address) {
            Object.keys(locationTranslations).forEach(ko => {
                translated.address = translated.address.replace(ko, locationTranslations[ko]);
            });
        }

        // Translate title
        if (translated.title) {
            Object.keys(propertyTypeTranslations).forEach(ko => {
                translated.title = translated.title.replace(ko, propertyTypeTranslations[ko]);
            });
            Object.keys(locationTranslations).forEach(ko => {
                translated.title = translated.title.replace(ko, locationTranslations[ko]);
            });
        }

        // Translate description (basic keyword replacement)
        if (translated.description) {
            let desc = translated.description;
            Object.keys(textTranslations).forEach(ko => {
                desc = desc.replace(new RegExp(ko, 'g'), textTranslations[ko]);
            });
            translated.description = desc;
        }

        return translated;
    }

    /**
     * Translate an array of properties
     * @param {Array} properties - Array of property objects
     * @returns {Array} Translated properties
     */
    function translateProperties(properties) {
        if (!Array.isArray(properties)) return properties;
        return properties.map(translateProperty);
    }

    // Export to global scope
    window.LR_translate = {
        property: translateProperty,
        properties: translateProperties,
        getPageLanguage: getPageLanguage
    };

})();
