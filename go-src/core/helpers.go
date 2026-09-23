package core

func Fallback(s, defaultValue string) string {
	if s == "" {
		return defaultValue
	}
	return s
}
func IntValue(v *int64) int {
	if v == nil {
		return 0
	}
	return int(*v)
}
