from rest_framework import serializers

from .models import PolicyRule, RiskFinding


class RiskFindingSerializer(serializers.ModelSerializer):
    class Meta:
        model = RiskFinding
        fields = ['id', 'organization', 'envelope', 'title', 'severity', 'status', 'description', 'metadata', 'created_at']
        read_only_fields = ['id', 'created_at']


class PolicyRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = PolicyRule
        fields = ['id', 'organization', 'name', 'rule_type', 'config', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']
