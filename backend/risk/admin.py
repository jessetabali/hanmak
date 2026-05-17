from django.contrib import admin

from .models import PolicyRule, RiskFinding


@admin.register(RiskFinding)
class RiskFindingAdmin(admin.ModelAdmin):
    list_display = ['title', 'organization', 'envelope', 'severity', 'status', 'created_at']
    list_filter = ['severity', 'status']
    search_fields = ['title', 'description']


@admin.register(PolicyRule)
class PolicyRuleAdmin(admin.ModelAdmin):
    list_display = ['name', 'organization', 'rule_type', 'is_active', 'created_at']
    list_filter = ['rule_type', 'is_active']

# Register your models here.
