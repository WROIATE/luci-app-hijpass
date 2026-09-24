package main

import (
"fmt"
"os"

"hijpass/config/command"
)

func main() {
	if err := command.Run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
