package valueobjects

type Money struct{ Amount string }

func NewMoney(amount string) Money { return Money{Amount: amount} }
