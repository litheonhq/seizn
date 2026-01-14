#!/usr/bin/env python3
"""
Script to add billing tab translations to i18n files.
"""

import json
import os

# Base path for i18n files
base_path = r"C:\Users\admin\Projects\seizn\src\i18n\dictionaries"

# Billing translations for each language
billing_translations = {
    "en": {
        "tabs_billing": "Billing",
        "billing": {
            "title": "Billing & Usage",
            "subtitle": "Manage your plan and monitor usage",
            "currentPlan": "Current Plan",
            "monthlyPrice": "Monthly Price",
            "upgradePlan": "Upgrade Plan",
            "quotaWarningTitle": "Approaching Quota Limit",
            "quotaWarningDesc": "You're using {percent}% of your {resource} quota. Consider upgrading your plan.",
            "upgradeNow": "Upgrade Now",
            "memoriesUsage": "Memories Usage",
            "apiCallsUsage": "API Calls Usage",
            "apiKeysUsage": "API Keys Usage",
            "unlimited": "Unlimited",
            "planComparison": "Plan Comparison",
            "feature": "Feature",
            "memoriesLabel": "Memories",
            "apiCallsLabel": "API Calls/Month",
            "apiKeysLabel": "API Keys",
            "priceLabel": "Price",
            "contactUs": "Contact Us",
            "used": "used",
            "of": "of"
        }
    },
    "ko": {
        "tabs_billing": "결제",
        "billing": {
            "title": "결제 및 사용량",
            "subtitle": "요금제 관리 및 사용량 모니터링",
            "currentPlan": "현재 요금제",
            "monthlyPrice": "월 요금",
            "upgradePlan": "요금제 업그레이드",
            "quotaWarningTitle": "한도 근접 알림",
            "quotaWarningDesc": "{resource} 한도의 {percent}%를 사용 중입니다. 요금제 업그레이드를 고려해 보세요.",
            "upgradeNow": "지금 업그레이드",
            "memoriesUsage": "메모리 사용량",
            "apiCallsUsage": "API 호출 사용량",
            "apiKeysUsage": "API 키 사용량",
            "unlimited": "무제한",
            "planComparison": "요금제 비교",
            "feature": "기능",
            "memoriesLabel": "메모리",
            "apiCallsLabel": "월 API 호출",
            "apiKeysLabel": "API 키",
            "priceLabel": "가격",
            "contactUs": "문의하기",
            "used": "사용",
            "of": "중"
        }
    },
    "ja": {
        "tabs_billing": "料金",
        "billing": {
            "title": "料金と使用量",
            "subtitle": "プランの管理と使用量のモニタリング",
            "currentPlan": "現在のプラン",
            "monthlyPrice": "月額料金",
            "upgradePlan": "プランをアップグレード",
            "quotaWarningTitle": "使用量の上限に近づいています",
            "quotaWarningDesc": "{resource}の{percent}%を使用中です。プランのアップグレードをご検討ください。",
            "upgradeNow": "今すぐアップグレード",
            "memoriesUsage": "メモリ使用量",
            "apiCallsUsage": "API呼び出し使用量",
            "apiKeysUsage": "APIキー使用量",
            "unlimited": "無制限",
            "planComparison": "プラン比較",
            "feature": "機能",
            "memoriesLabel": "メモリ",
            "apiCallsLabel": "月間API呼び出し",
            "apiKeysLabel": "APIキー",
            "priceLabel": "価格",
            "contactUs": "お問い合わせ",
            "used": "使用",
            "of": "中"
        }
    }
}

def update_i18n_file(lang: str):
    """Update a single i18n file with billing translations."""
    file_path = os.path.join(base_path, f"{lang}.json")

    # Read existing file
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Get the translations for this language
    trans = billing_translations[lang]

    # Add billing tab to tabs section
    if "dashboard" in data and "settingsPage" in data["dashboard"]:
        settings = data["dashboard"]["settingsPage"]

        # Add billing to tabs
        if "tabs" in settings:
            # Create new tabs dict with billing in the right position
            old_tabs = settings["tabs"]
            new_tabs = {}
            for key, value in old_tabs.items():
                new_tabs[key] = value
                if key == "profile":
                    new_tabs["billing"] = trans["tabs_billing"]
            settings["tabs"] = new_tabs

        # Add billing section
        settings["billing"] = trans["billing"]

    # Write back to file
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Updated {file_path}")

if __name__ == "__main__":
    for lang in ["en", "ko", "ja"]:
        update_i18n_file(lang)
    print("Done!")
